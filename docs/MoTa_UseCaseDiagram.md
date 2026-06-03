# Mô tả Use Case Diagram — Hệ thống Paper Tracker

> Bản tóm tắt nhóm use case và quan hệ Include/Extend. Chi tiết xem `USE_CASE_SPECIFICATION.md`.

## 1. Tác nhân

### User
Đăng nhập bằng email/password, nhận JWT HMAC-SHA256 (TTL 24h, jjwt 0.12.6). Role mặc định: `USER`.

### Admin (User với role ADMIN)
Bootstrap qua `V5__seed_admin.sql`. Có quyền truy cập UC17 (admin endpoints). Không có endpoint đăng ký ADMIN.

### Scheduler
Pipeline nền lúc 6h sáng. Thread pool riêng (poolSize = 3).

### Retry Scheduler
Xử lý lại paper lỗi mỗi 30 phút (fixedDelay từ khi run trước kết thúc).

---

## 2. Nhóm chức năng của User

### 2.1. Authentication
- Đăng ký (UC01) — email unique, BCrypt, `role = USER`.
- Đăng nhập (UC02) — JWT HMAC-SHA256, TTL 24h.

Giới hạn: không có lock, forgot password, 2FA. Logout phía client.

### 2.2. Topic Management (UC03)
- Thêm topic — max 10/user, max 5 keyword/topic. UNIQUE `(user_id, name)` → 409 nếu trùng.
- Sửa topic (name, keywords, is_active).
- Xóa topic — hard delete, cascade PAPER_TOPIC, không xóa PAPER.

Keywords: comma-separated, trim, lowercase, VARCHAR(255), max 5 keyword, validate ở DTO.

### 2.3. Paper Browsing
- Xem danh sách paper (UC04) — DONE only, `PagedResponse<T>`, sort `published_at desc`.
- Tìm kiếm paper (UC05) — `plainto_tsquery` + `idx_paper_fts_search` (title+abstract+authors).
- Lọc theo topic, favorites.
- Xem chi tiết paper (UC06) — kèm recommendation top-10 nếu DONE.
- Thống kê xu hướng (UC15) — GROUP BY tháng, giới hạn 2 năm.

### 2.4. Favorite Management
- Lưu (UC07) — idempotent.
- Bỏ lưu (UC07) — `DELETE /papers/{paperId}/favorite`, derive user_id từ JWT.
- Xem danh sách yêu thích (UC09) — `PagedResponse<T>`, sort `created_at desc`.

### 2.5. Notification Management
- Xem (UC08) — `PagedResponse<T>`, filter `isRead`, sort `created_at desc`.
- Đánh dấu một đã đọc (UC08).
- **Đánh dấu tất cả đã đọc (UC08b)** — batch UPDATE.

### 2.6. Recommendation
- UC14 — real-time, HNSW, cosine distance < 0.5, `ef_search = 128` (global HikariCP), cached 1h. UI-only, không tạo notification.

### 2.7. Admin (UC17)
- `GET /admin/papers/failed` — xem paper FAILED (paged).
- `POST /admin/papers/{id}/reset` — reset retryCount=0 để RetryScheduler pick up lại.
- `POST /admin/papers/reset-all-failed` — bulk reset tất cả paper FAILED.
- `POST /admin/pipeline/trigger` — trigger Main Pipeline thủ công (async, Virtual Thread).
- `POST /admin/pipeline/retry` — trigger RetryScheduler thủ công.
- Yêu cầu `role = ADMIN`.

---

## 3. Nhóm chức năng hệ thống nền

### 3.1. Fetch Paper (UC10)
- 6AM, thread pool độc lập.
- Topic `is_active = true`. Keywords max 5.
- arXiv API: **`sortBy=submittedDate&sortOrder=descending`** bắt buộc. Max 10 paper/keyword. Delay 1500ms (arXiv rate limit ~1 req/s), timeout 30s, retry 2× exponential backoff.
- UPSERT: `INSERT … ON CONFLICT (arxiv_id) DO NOTHING`.

### 3.2. AI Processing (UC11)
- HuggingFace embedding batch max 32. HTTP 503 → chờ 30s, retry 1 lần.
- Duplicate: `<=>` HNSW, **distance < 0.05** (= similarity > 0.95). **`<=>` trả distance, không phải similarity.** Window 90 days.
- Groq single call, `response_format: json_object`. Transient retry 1× sau 5s cho 5xx/timeout.
- Validate: `quality_score ∈ [0.0, 10.0]`, `summary` không rỗng ≤ 2000 ký tự.
- `REQUIRES_NEW` per paper. Outer method không có `@Transactional`.

### 3.3. Retry AI Processing (UC16)
- fixedDelay 30 phút. Query: `FAILED AND retry_count < 3`. Cập nhật `last_retry_at`.
- Thành công → DONE → UC12 → UC13.
- Thất bại → tăng `retry_count`. Sau 3 lần → giữ FAILED. Admin reset qua UC17.

### 3.4. Topic Matching (UC12)
- `phraseto_tsquery` + **`idx_paper_fts_topic`** (expression: `title || abstract` — không có authors).
- Expression trong query phải khớp hoàn toàn với index expression.
- Java `anyMatch`. Match → `INSERT INTO paper_topic … ON CONFLICT DO NOTHING`.
- **Không dùng ILIKE.** Không include authors (keyword topic là chủ đề, không phải tên người).

### 3.5. Notification Creation (UC13)
- Chỉ tạo `NEW_PAPER`. Deduplicate users, lấy topic đầu tiên làm `topicName`.
- `INSERT … ON CONFLICT (user_id, paper_id, type) DO NOTHING`.
- Recommendation không tạo notification (UC14 UI-only).

---

## 4. Quan hệ Include / Extend
- `Xem danh sách paper` <<include>> `Lọc theo topic`
- `Xem chi tiết paper` <<extend>> `Xem recommendation` *(UI-only, không tạo notification)*
- `Quản lý topic` <<extend>> `Xem thống kê xu hướng`
- `Fetch Paper` <<include>> `AI Processing`
- `AI Processing` <<include>> `Topic Matching`
- `Topic Matching` <<include>> `Tạo NEW_PAPER Notification`
- `Retry AI Processing` <<include>> `AI Processing`
- `Retry AI Processing` <<include>> `Topic Matching` *(sau AI thành công)*
- `Retry AI Processing` <<include>> `Tạo NEW_PAPER Notification`
- `Admin quản lý paper lỗi` <<extend>> `Reset paper FAILED`

---

## 5. Quyết định thiết kế đã xác nhận

| Vấn đề | Quyết định |
|---|---|
| Embedding model | `BAAI/bge-small-en-v1.5` → `vector(384)`. Cố định. |
| pgvector JPA | Custom `VectorUserType` (implements `UserType<float[]>` + PGobject). Spring Boot 4.0.6 / Hibernate 7.x. |
| JWT | jjwt 0.12.6, HMAC-SHA256, TTL 24h. |
| HNSW index | Day-1 bắt buộc (m=16, ef_construction=64). ef_search=128 qua HikariCP connection-init-sql. |
| UC05 Search | `plainto_tsquery` + `idx_paper_fts_search` (title+abstract+authors). AND logic linh hoạt. |
| UC12 Topic Matching | `phraseto_tsquery` + `idx_paper_fts_topic` (title+abstract only). Exact phrase. Không include authors. **HAI GIN index riêng biệt** vì expression khác nhau. |
| Recommendation | UI-only. Không ghi NOTIFICATION. Distance < 0.5. |
| pgvector `<=>` | Trả cosine **distance** (0–1). Distance = 1 − Similarity. Duplicate: distance < 0.05. Recommendation: distance < 0.5. |
| UPSERT bắt buộc | `INSERT … ON CONFLICT (arxiv_id) DO NOTHING`. Không dùng `save()`/`saveAll()`. |
| arXiv sort | Bắt buộc `sortBy=submittedDate&sortOrder=descending` trong API URL. |
| Groq validation | `response_format: json_object`. Validate `quality_score ∈ [0.0,10.0]` + `summary` ≤ 2000 ký tự. Transient retry 1× sau 5s cho 5xx/timeout. |
| Groq concurrency | ThreadPoolTaskScheduler poolSize=3. Delay 2s/call. Free tier ~30 RPM. |
| Manual mapper | `@Component` PaperMapper — không dùng MapStruct. Embedding không có trong PaperResponse. |
| REQUIRES_NEW isolation | Outer method không có `@Transactional`. HikariCP pool-size = 20. |
| FAVORITE delete | `DELETE /papers/{paperId}/favorite`, derive user_id từ JWT. Không cần favoriteId. |
| FAVORITE index | Không khai báo riêng — auto từ UNIQUE constraint. |
| Admin bootstrap | V5__seed_admin.sql. Không có endpoint tạo ADMIN. |
| Admin dead-letter | UC17: `GET /admin/papers/failed`, `POST /admin/papers/{id}/reset`, `POST /admin/papers/reset-all-failed`. Field `last_retry_at` trong PAPER. |
| quality_score constraint | DB CHECK `quality_score IS NULL OR [0.0, 10.0]` + app validation. |
| PagedResponse chuẩn | `{content, page, size, totalElements, totalPages, last}` cho mọi API list. |
| UC15 time bound | `published_at >= NOW() - INTERVAL '2 years'`. Index `idx_pt_stats (topic_id, paper_id)`. |
| Flyway order | V1→V2 (guard)→V3→V4→V5. |
| Cascade TOPIC delete | `PAPER_TOPIC.topic_id → TOPIC ON DELETE CASCADE`. PAPER không bị xóa. |