# Tổng quan dự án: Hệ thống Paper Tracker

## 1. Giới thiệu
Hệ thống giúp người dùng theo dõi, tóm tắt và quản lý các bài báo khoa học từ arXiv theo các chủ đề quan tâm.

Phạm vi và giới hạn:
- Authentication: chỉ xử lý đăng ký/đăng nhập bằng email/password, sinh JWT; không có forgot password, lock account, 2FA.
- JWT access token TTL: 24 giờ. Không dùng refresh token. Logout phía client xóa token khỏi storage.
- User không có chức năng retry thủ công pipeline AI; mọi retry do Retry Scheduler xử lý tự động.
- Xóa topic là hard delete. Bản ghi `PAPER_TOPIC` liên quan bị xóa cascade. Dữ liệu `PAPER` không bị xóa.
- Giới hạn đồ án: tối đa 10 topic/user, 5 keyword/topic, 10 paper/keyword/lần fetch.
- Embedding model cố định: `sentence-transformers/all-MiniLM-L6-v2` → `vector(384)`.

---

## 2. Tech Stack

### Frontend
- ReactJS (Vite + TypeScript), Tailwind CSS, React Functional Components + Hooks, Axios với JWT interceptor.

### Backend
- **Spring Boot 4.0.x** (Hibernate 7.x) — pin ở mức minor để đảm bảo tương thích dependency.
- Spring Security 6 (JWT stateless), Spring Data JPA + Hibernate 7.x, MapStruct, Spring Cache + Caffeine.

### Database
- PostgreSQL 15+ với extension `pgvector`.
- Flyway: V1 extensions → V2 tables → V3 constraints → V4 indexes → V5 seed admin.

### AI & External API
| Thành phần | Service | Ghi chú |
|---|---|---|
| Embedding | HuggingFace Inference API — `all-MiniLM-L6-v2` | Output: `vector(384)`. Batch max 32. Retry 1 lần sau 30s nếu nhận 503 |
| Summary + Score | Groq API — `llama3-8b-8192` | Single call cho cả summary + quality_score. Free tier ~30 RPM |
| Paper Fetch | arXiv API (Atom/XML) | Rate limit 3 req/s. Delay 350ms. **Bắt buộc thêm `sortBy=submittedDate&sortOrder=descending`** để lấy paper mới nhất |

### Dependencies bổ sung quan trọng

```xml
<!-- pgvector JPA mapping — Spring Boot 4.0.x / Hibernate 7.x -->
<dependency>
    <groupId>io.hypersistence</groupId>
    <artifactId>hypersistence-utils-hibernate-70</artifactId>
    <version>3.15.2</version>
</dependency>

<!-- JWT -->
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-api</artifactId><version>0.12.6</version></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-impl</artifactId><version>0.12.6</version><scope>runtime</scope></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-jackson</artifactId><version>0.12.6</version><scope>runtime</scope></dependency>
```

### Kiến trúc backend
- Phân lớp: `Controller → DTO → Service → Repository → Entity`.
- MapStruct: **bắt buộc** `@Mapping(target = "embedding", ignore = true)` trong tất cả Paper mapper. Unit test `assertNull(dto.getEmbedding())`.
- `@ControllerAdvice` cho exception tập trung.

---

## 3. Mục tiêu nghiệp vụ
- Theo dõi paper mới theo topic; fetch từ arXiv theo keyword của topic active.
- Tóm tắt abstract bằng AI; tìm kiếm, lọc, quản lý paper cá nhân.
- Gợi ý paper liên quan real-time khi xem chi tiết.
- Thông báo khi có paper mới phù hợp topic.
- Thống kê xu hướng theo chủ đề theo thời gian.

---

## 4. Thông tin paper cần lưu
- `arxiv_id`, `title`, `abstract`, `authors`, `published_at`, `paper_url`, `pdf_url`.
- `summary`, `quality_score` (Groq single call, validate ∈ [0.0, 10.0]).
- `embedding` — `vector(384)`.
- `processing_status`, `retry_count`, `last_retry_at`, `is_duplicate`, `original_paper_id`, `last_error`.

### Enum chuẩn hóa
| Enum | Giá trị | Ghi chú |
|---|---|---|
| `user.role` | `USER`, `ADMIN` | Default `USER`. ADMIN bootstrap qua V5__seed_admin.sql |
| `processing_status` | `PENDING`, `DONE`, `FAILED` | |
| `notification.type` | `NEW_PAPER` | Recommendation là UI-only |

---

## 5. Mô hình dữ liệu chính

### USER
- `email` UNIQUE, `password_hash` BCrypt, `role` ∈ {USER, ADMIN}.
- ADMIN được tạo qua Flyway seed — không có endpoint đăng ký ADMIN.

### TOPIC
- UNIQUE `(user_id, name)`. `keywords`: VARCHAR(255), comma-separated, max 5.

### PAPER
- `embedding` kiểu `vector(384)`, map bằng `@Type(VectorType.class)` với hypersistence-utils.
- `original_paper_id` FK tự tham chiếu (`ON DELETE SET NULL`).
- `last_retry_at`: timestamp lần Retry Scheduler xử lý gần nhất.
- API list mặc định **chỉ trả `processing_status = 'DONE'`**.

### PAPER_TOPIC
- PK tổng hợp `(paper_id, topic_id)`. FK `topic_id → TOPIC ON DELETE CASCADE`.

### FAVORITE
- UNIQUE `(user_id, paper_id)`. Index tự tạo từ UNIQUE — không khai báo B-tree riêng.
- API bỏ lưu nhận `paperId`, derive `user_id` từ JWT.

### NOTIFICATION
- Chỉ `type = NEW_PAPER`. UNIQUE `(user_id, paper_id, type)`.
- Recommendation không ghi vào bảng này.

---

## 6. System Processing Pipeline

### 6.1. Cấu hình Scheduler Thread Pool
```java
@Configuration
@EnableScheduling
public class SchedulerConfig implements SchedulingConfigurer {
    @Override
    public void configureTasks(ScheduledTaskRegistrar taskRegistrar) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(3);
        scheduler.setThreadNamePrefix("paper-scheduler-");
        scheduler.initialize();
        taskRegistrar.setTaskScheduler(scheduler);
    }
}
```

### 6.2. Pipeline chính lúc 6h sáng
`@Scheduled(cron = "0 0 6 * * *")`

1. Lấy danh sách `TOPIC` đang `is_active = true`.
2. Tách `keywords` của từng topic (max 5, parse bằng dấu phẩy).
3. Gọi arXiv API theo từng keyword, lấy tối đa `max-results-per-keyword` paper. **URL phải bao gồm `sortBy=submittedDate&sortOrder=descending`** để đảm bảo lấy paper mới nhất. Delay 350ms giữa các request.
4. Timeout mỗi request arXiv: 30 giây.
5. Lỗi tạm thời (timeout, 5xx, 429): retry với exponential backoff, tối đa 2 lần.
6. Lỗi vĩnh viễn (4xx trừ 429): bỏ keyword, ghi log.
7. Hợp nhất, khử trùng theo `arxiv_id` trong batch.
8. Lưu bằng `INSERT INTO paper … ON CONFLICT (arxiv_id) DO NOTHING` (UPSERT bắt buộc). Paper mới: `PENDING`, `retry_count = 0`.
9. Generate embedding (HuggingFace), batch max 32. HTTP 503 → chờ 30s, retry 1 lần.
10. Duplicate detection: `embedding <=> candidate < 0.05` (similarity > 0.95) qua HNSW. Candidate window: 90 days.
    - Duplicate → `is_duplicate = true`, `original_paper_id`, `DONE`.
    - Không duplicate → Groq single call.
11. **Groq call:** dùng `response_format: json_object`. Nếu nhận HTTP 5xx hoặc timeout: retry **1 lần** sau 5 giây. Không retry 429 (cần backoff dài hơn — để Retry Scheduler xử lý). Delay 2s giữa các Groq calls.
12. **Validate Groq response:** `quality_score ∈ [0.0, 10.0]`, `summary` không rỗng ≤ 2000 ký tự. Fail → `FAILED` + `last_error`.
13. Lỗi sau retry: `FAILED`, tăng `retry_count`, set `last_error`.
14. **Topic Matching** (mục 7).
15. **Notification Creation** (mục 9).

> **Transaction boundary:** mỗi paper trong `@Transactional(propagation = REQUIRES_NEW)`. Method orchestrate batch KHÔNG có `@Transactional` để tránh connection pool exhaustion với HikariCP.
>
> **Groq concurrency risk:** Retry Scheduler có thể overlap với Main Pipeline trong edge case (HuggingFace cold start kéo dài). Resilience4j RateLimiter tại `GroqApiClient` với hard limit 28 req/min là guard toàn cục.

### 6.3. Retry Pipeline
`@Scheduled(fixedDelay = 1800000)` — mỗi 30 phút tính từ khi run trước kết thúc.

1. Query: `processing_status = FAILED AND retry_count < 3`.
2. Thực hiện lại pipeline AI (embedding → duplicate check → Groq + validation).
3. Cập nhật `last_retry_at = NOW()`.
4. Thành công → `DONE` → Topic Matching → Notification Creation.
5. Thất bại → tăng `retry_count`, cập nhật `last_error`.
6. `retry_count >= 3` → giữ FAILED. Admin reset qua UC17.

---

## 7. Topic Matching
- Dùng `phraseto_tsquery` (exact phrase match) + GIN index `idx_paper_fts_topic` (title + abstract only):
```sql
  SELECT 1 FROM paper
  WHERE id = :paperId
  AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''))
      @@ phraseto_tsquery('english', :keyword)
```
- **Expression trong query phải khớp hoàn toàn với expression của `idx_paper_fts_topic`.** Không include authors — keyword topic là chủ đề nghiên cứu, không phải tên người.
- Java `anyMatch` trên danh sách keywords. Match → `INSERT INTO paper_topic … ON CONFLICT DO NOTHING`.

---

## 8. Recommendation Logic
- Real-time khi user mở chi tiết paper (UC14). Không chạy background.
- **`ef_search = 128`** được cấu hình global qua HikariCP `connection-init-sql` — không cần `SET LOCAL` trong từng query.
- Tập candidate: `DONE`, `is_duplicate = false`, `id <> :paperId`, `published_at >= NOW() - 1 year`.
- Ngưỡng: cosine **distance < 0.5** (similarity > 50%). Top-10, sort distance tăng dần.
- Cache: Spring Cache + Caffeine, key = `paper_id`, TTL = 1 giờ.
- **UI-only** — không ghi vào NOTIFICATION.

---

## 9. Notification Logic
- Chỉ `NEW_PAPER` do Scheduler tạo. Mỗi (user, paper) nhận đúng một notification.
- `INSERT … ON CONFLICT (user_id, paper_id, type) DO NOTHING`.
- Recommendation không tạo notification.

---

## 10. Chức năng

### Cơ bản
- Đăng ký / đăng nhập (JWT HMAC-SHA256, TTL 24h, jjwt 0.12.6).
- CRUD Topic (max 10/user, max 5 keyword/topic, unique name per user).
- Xem danh sách paper (DONE only, paging `PagedResponse<T>`, filter topic/keyword/favorite).
- Tìm kiếm paper (plainto_tsquery + `idx_paper_fts_search`, bao gồm authors).
- Xem chi tiết paper + recommendation top-10.
- Lưu/bỏ lưu yêu thích (bỏ lưu qua `DELETE /papers/{paperId}/favorite`).
- Xem danh sách yêu thích (paging).
- Xem/quản lý notification (paging, filter isRead, mark all read).

### Nâng cao
- Recommendation real-time (HNSW, ef_search=128, distance < 0.5, cached 1h).
- Duplicate detection (distance < 0.05 = similarity > 0.95, window 90 days).
- Notification `NEW_PAPER` tự động từ Scheduler.
- AI scoring + summary từ Groq (single call + JSON validation).
- Retry AI tự động (max 3 lần, 30 phút/lần, track `last_retry_at`).
- Admin endpoints: xem/reset paper FAILED (UC17).
- Thống kê xu hướng theo chủ đề (GROUP BY tháng, giới hạn 2 năm).

---

## 11. Security
- JWT từ `SecurityContextHolder`; không nhận `user_id` từ client.
- `TOPIC`, `FAVORITE`, `NOTIFICATION` luôn query theo `user_id` từ JWT.
- Admin endpoints (`/admin/**`) yêu cầu `hasRole('ADMIN')`.

---

## 12. Ràng buộc và tối ưu

### Unique Constraints
| Bảng | Constraint |
|---|---|
| USER | `email` |
| TOPIC | `(user_id, name)` |
| PAPER | `arxiv_id` |
| FAVORITE | `(user_id, paper_id)` |
| PAPER_TOPIC | `(paper_id, topic_id)` (PK) |
| NOTIFICATION | `(user_id, paper_id, type)` |

### Index Day 1
- B-tree đơn: `PAPER(published_at, arxiv_id, processing_status, is_duplicate, original_paper_id)`.
- B-tree composite: `PAPER_TOPIC(topic_id)`, `PAPER_TOPIC(paper_id)`, `PAPER_TOPIC(topic_id, paper_id)`, `TOPIC(user_id, is_active)`, `TOPIC(user_id, name)`, `NOTIFICATION(user_id, is_read, created_at)`.
- FAVORITE: index tự tạo từ UNIQUE — không khai báo riêng.
- **HNSW**: `PAPER(embedding)` — bắt buộc Day 1.
- **GIN**: `idx_paper_fts_search` (title+abstract+authors) cho UC05; `idx_paper_fts_topic` (title+abstract) cho UC12.

---

## 13. Cấu hình application.yml
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/papertracker
    hikari:
      maximum-pool-size: 20
      # Set ef_search globally cho tất cả connections — thay thế SET LOCAL trong query
      connection-init-sql: "SET hnsw.ef_search = 128"
  jpa:
    hibernate:
      ddl-auto: validate

jwt:
  secret: <256-bit-base64-encoded-secret>
  expiration-ms: 86400000

scheduler:
  arxiv:
    max-results-per-keyword: 10
    request-delay-ms: 350
    timeout-seconds: 30
    # Bắt buộc thêm params này vào arXiv API URL
    sort-by: submittedDate
    sort-order: descending
  groq:
    call-delay-ms: 2000
    rate-limit-rpm: 28
    transient-retry-delay-ms: 5000   # Retry 1 lần sau 5s cho 5xx/timeout
  retry:
    max-attempts: 3

ai:
  huggingface:
    model: sentence-transformers/all-MiniLM-L6-v2
    batch-size: 32
    retry-wait-on-503-ms: 30000
  groq:
    model: llama3-8b-8192
    max-summary-length: 2000

recommendation:
  distance-threshold: 0.5
  max-results: 10
  cache-ttl-hours: 1

duplicate-detection:
  distance-threshold: 0.05
  candidate-window-days: 90

limits:
  max-topics-per-user: 10
  max-keywords-per-topic: 5

trend-stats:
  max-history-years: 2
```

---

## 14. Giới hạn hệ thống
- Thiết kế cho phạm vi đồ án: số lượng topic và paper vừa phải.
- Groq free tier ~30 RPM: 500 paper/run × 1 call = ~17 phút. Delay 2s + RateLimiter 28 RPM ngăn rate limit.
- HuggingFace free tier có cold start: request đầu có thể mất 20–30s.
- HikariCP pool size 20 đảm bảo đủ connection cho `REQUIRES_NEW` transaction pattern.
- Không triển khai 2FA, lock account, refresh token, audit log trong phạm vi này.