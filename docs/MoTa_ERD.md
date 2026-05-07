# Mô tả chi tiết ERD — Hệ thống Paper Tracker

## 1. Triết lý thiết kế
Sử dụng PostgreSQL + `pgvector` cho AI features. Ưu tiên toàn vẹn dữ liệu, HNSW Day-1, dễ triển khai với Spring Boot 3.3.x.

Phạm vi: JWT auth only, không retry thủ công, hard delete TOPIC, max 10 topic/5 keyword/10 paper.

---

## 2. Chi tiết các bảng chính

### Bảng USER
- `id` UUID, `email` UNIQUE, `password_hash` BCrypt, `role` VARCHAR(10) CHECK IN ('USER','ADMIN'), `created_at`.
- ADMIN không được tạo qua UC01. Bootstrap qua `V5__seed_admin.sql`.

```java
@Column(nullable = false, length = 10)
@Enumerated(EnumType.STRING)
private UserRole role = UserRole.USER;
```

---

### Bảng TOPIC
- UNIQUE `(user_id, name)` — enforce ở cả DB và service. Vi phạm → 409.
- `keywords`: VARCHAR(255), comma-separated, trim, lowercase, max 5 keyword.

---

### Bảng PAPER
- `id` UUID, `arxiv_id` UNIQUE, `title`, `abstract` (TEXT — **tên cột thực tế là `abstract`, không phải `abstract_text`**), `authors`.
- `embedding`: `vector(384)`. Map bằng `@Type(VectorType.class)` với `hypersistence-utils-hibernate-65 v3.8.3`.
- `quality_score`: float, validate ∈ [0.0, 10.0] ở cả app layer và DB CHECK constraint.
- `original_paper_id`: FK tự tham chiếu → PAPER.id (`ON DELETE SET NULL`).
- `last_retry_at`: TIMESTAMP NULL — cập nhật mỗi khi Retry Scheduler xử lý paper.
- API list chỉ trả `processing_status = 'DONE'`.

```java
@Column(columnDefinition = "vector(384)")
@Type(VectorType.class)
private float[] embedding;

// Recommendation query — ef_search đã set global qua HikariCP connection-init-sql
// KHÔNG dùng SET LOCAL trong query
@Query(value = """
    SELECT * FROM paper
    WHERE processing_status = 'DONE'
      AND is_duplicate = false
      AND id <> :paperId
      AND published_at >= NOW() - INTERVAL '1 year'
      AND embedding <=> CAST(:embedding AS vector) < 0.5
    ORDER BY embedding <=> CAST(:embedding AS vector)
    LIMIT 10
    """, nativeQuery = true)
List<Paper> findRecommendations(
    @Param("paperId") UUID paperId,
    @Param("embedding") String embedding
);
```

---

### Bảng PAPER_TOPIC
- PK tổng hợp `(paper_id, topic_id)`.
- FK `topic_id → TOPIC ON DELETE CASCADE`.
- Có `created_at` để truy vết.

---

### Bảng FAVORITE
- `id` UUID PK, `user_id` FK, `paper_id` FK, `created_at`.
- UNIQUE `(user_id, paper_id)` — PostgreSQL tự tạo index, không khai báo B-tree riêng.
- Bỏ lưu: API nhận `paperId`, backend xóa bằng `(user_id từ JWT, paperId)`.

---

### Bảng NOTIFICATION
- `type` chỉ có giá trị `NEW_PAPER`. CHECK constraint `type IN ('NEW_PAPER')`.
- UNIQUE `(user_id, paper_id, type)`. `INSERT … ON CONFLICT DO NOTHING`.
- Recommendation không ghi vào bảng này.

---

## 3. Quy trình xử lý dữ liệu

### 3.1. Fetch paper theo keyword
1. Load topics `is_active = true`.
2. Parse keywords (max 5, comma-split).
3. Gọi arXiv API với **`sortBy=submittedDate&sortOrder=descending`** — bắt buộc để lấy paper mới nhất. Delay 350ms.
4. Hợp nhất, khử trùng theo `arxiv_id`.
5. `INSERT INTO paper … ON CONFLICT (arxiv_id) DO NOTHING`. Paper mới: `PENDING`, `retry_count = 0`, `is_duplicate = false`.

---

### 3.2. AI processing
1. Lấy paper `PENDING`.
2. HuggingFace embedding batch max 32. HTTP 503 → chờ 30s, retry 1 lần.
3. Duplicate check: `embedding <=> candidate < 0.05` (cosine distance — **`<=>` trả distance (0–1), không phải similarity; distance = 1 − similarity**). Candidate: 90 days.
4. Duplicate → `is_duplicate = true`, `original_paper_id`, `DONE`.
5. Không duplicate → Groq single call (`response_format: json_object`).
   - **Transient retry:** HTTP 5xx/timeout → retry 1 lần sau 5 giây. HTTP 429 → không retry tại đây.
   - **Validate:** `quality_score ∈ [0.0, 10.0]`, `summary` không rỗng ≤ 2000 ký tự. Fail → `FAILED`.
   - Pass → `DONE`.
6. Cập nhật `updated_at`. Transaction: `REQUIRES_NEW` per paper. Outer method không có `@Transactional`.

---

### 3.3. Retry failed paper
1. Query: `FAILED AND retry_count < 3`. Cập nhật `last_retry_at = NOW()`.
2. Thực hiện lại 3.2. Thành công → `DONE` → Topic Matching → Notification.
3. Thất bại → tăng `retry_count`. `retry_count >= 3` → giữ FAILED, admin reset qua UC17.

---

### 3.4. Topic matching — Full-text search
Dùng `phraseto_tsquery` + **`idx_paper_fts_topic`** (expression: `title || abstract` — không có authors):

```java
@Query(value = """
    SELECT COUNT(*) > 0 FROM paper
    WHERE id = :paperId
      AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''))
          @@ phraseto_tsquery('english', :keyword)
    """, nativeQuery = true)
boolean matchesByFullText(@Param("paperId") UUID paperId, @Param("keyword") String keyword);
```

```java
boolean match = keywords.stream()
    .anyMatch(kw -> paperRepository.matchesByFullText(paperId, kw));
```

Match → `INSERT INTO paper_topic … ON CONFLICT (paper_id, topic_id) DO NOTHING`.

> **Expression phải khớp HOÀN TOÀN với `idx_paper_fts_topic`:** `to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''))`. Nếu include authors trong query → expression không khớp → PostgreSQL bỏ qua index → sequential scan.
>
> **Lý do `phraseto_tsquery`:** keyword topic là cụm chuyên ngành cần match theo thứ tự. UC05 dùng `plainto_tsquery` (AND logic linh hoạt hơn).

---

### 3.5. Notification Creation
**Chỉ tạo NEW_PAPER (Scheduler):**
1. Lấy topics vừa match. Deduplicate users. Mỗi user lấy topic đầu tiên làm `topicName`.
2. `type = NEW_PAPER`, `message = "New paper matched your topic '{topicName}': {title}"`.
3. `INSERT … ON CONFLICT (user_id, paper_id, type) DO NOTHING`.

**Recommendation không tạo notification.** Kết quả UC14 chỉ qua API response.

---

## 4. Cơ chế phát hiện trùng lặp
- **`<=>` trả cosine DISTANCE (0–1), không phải similarity. Distance = 1 − Similarity.**
- Ngưỡng SQL: `embedding <=> candidate < 0.05` (= similarity > 0.95).
- Candidate: `published_at >= NOW() - INTERVAL '90 days'`.
- Index: `idx_paper_embedding_hnsw` (HNSW, vector_cosine_ops).

---

## 5. Cơ chế Recommendation
- UI-only — API response, không ghi DB.
- Ngưỡng: `embedding <=> cast < 0.5` (distance, = similarity > 50%).
- **`ef_search = 128`** set global qua `spring.datasource.hikari.connection-init-sql`. Không dùng `SET LOCAL` trong `@Query`.
- Cache: Spring Cache + Caffeine, key = `paper_id`, TTL = 1h.

---

## 6. Cơ chế gán Topic
- `phraseto_tsquery` + `idx_paper_fts_topic`. Java `anyMatch`. Một paper có thể match nhiều topic.
- PK tổng hợp `(paper_id, topic_id)`. FK `topic_id → TOPIC ON DELETE CASCADE`.

---

## 7. Tối ưu hệ thống

### Index Day 1 — Bắt buộc
| Index | Tên | Loại | Mục đích |
|---|---|---|---|
| `PAPER(embedding)` | `idx_paper_embedding_hnsw` | HNSW (vector_cosine_ops) | Duplicate + recommendation |
| `to_tsvector(title\|\|abstract\|\|authors)` | `idx_paper_fts_search` | GIN | UC05 full-text search |
| `to_tsvector(title\|\|abstract)` | `idx_paper_fts_topic` | GIN | UC12 topic matching |
| `PAPER(arxiv_id)` | auto từ UNIQUE | UNIQUE B-tree | UPSERT check |
| `PAPER(processing_status)` | `idx_paper_status` | B-tree | Retry Scheduler |
| `PAPER(published_at)` | `idx_paper_published_at` | B-tree | Sort + filter |
| `PAPER(is_duplicate)` | `idx_paper_is_duplicate` | B-tree | Recommendation filter |
| `PAPER(original_paper_id)` | `idx_paper_original` | B-tree | Tra cứu paper gốc |
| `PAPER_TOPIC(topic_id)` | `idx_pt_topic_id` | B-tree | Join |
| `PAPER_TOPIC(paper_id)` | `idx_pt_paper_id` | B-tree | Join |
| `PAPER_TOPIC(topic_id, paper_id)` | `idx_pt_stats` | B-tree composite | UC15 stats |
| `TOPIC(user_id, is_active)` | `idx_topic_user_active` | B-tree composite | Scheduler |
| `TOPIC(user_id, name)` | auto từ UNIQUE | UNIQUE B-tree | Name uniqueness |
| `FAVORITE(user_id, paper_id)` | auto từ UNIQUE | UNIQUE B-tree | Không khai báo riêng |
| `NOTIFICATION(user_id, is_read, created_at)` | `idx_notification_user_read` | B-tree composite | List query |

---

## 8. Kế hoạch Flyway Migration

```
V1__enable_extensions.sql
V2__create_tables.sql
V3__create_constraints.sql
V4__create_indexes.sql
V5__seed_admin.sql
```

### V1
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### V2 — Guard + snippet PAPER
```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector not installed. Run V1 first.';
  END IF;
END $$;

CREATE TABLE paper (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    arxiv_id          VARCHAR(50)  NOT NULL,
    title             TEXT         NOT NULL,
    abstract          TEXT,
    authors           TEXT,
    paper_url         VARCHAR(500),
    pdf_url           VARCHAR(500),
    summary           TEXT,
    quality_score     FLOAT,
    embedding         vector(384),
    is_duplicate      BOOLEAN      NOT NULL DEFAULT FALSE,
    original_paper_id UUID,
    processing_status VARCHAR(10)  NOT NULL DEFAULT 'PENDING',
    retry_count       INTEGER      NOT NULL DEFAULT 0,
    last_error        TEXT,
    last_retry_at     TIMESTAMP WITH TIME ZONE,
    published_at      TIMESTAMP WITH TIME ZONE,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

### V3 — Constraints
```sql
ALTER TABLE paper ADD CONSTRAINT chk_processing_status
    CHECK (processing_status IN ('PENDING', 'DONE', 'FAILED'));
ALTER TABLE paper ADD CONSTRAINT chk_quality_score
    CHECK (quality_score IS NULL OR (quality_score >= 0.0 AND quality_score <= 10.0));
ALTER TABLE "user" ADD CONSTRAINT chk_user_role
    CHECK (role IN ('USER', 'ADMIN'));
ALTER TABLE notification ADD CONSTRAINT chk_notification_type
    CHECK (type IN ('NEW_PAPER'));
```

### V4 — Indexes
```sql
CREATE INDEX idx_paper_embedding_hnsw ON paper
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- UC05: search trên title + abstract + authors
CREATE INDEX idx_paper_fts_search ON paper USING gin (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,'') || ' ' || coalesce(authors,''))
);

-- UC12: topic matching trên title + abstract only (expression phải khớp hoàn toàn)
CREATE INDEX idx_paper_fts_topic ON paper USING gin (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''))
);

CREATE INDEX idx_pt_stats ON paper_topic(topic_id, paper_id);
```

### V5 — Seed Admin
```sql
INSERT INTO "user" (id, email, password_hash, role, created_at)
VALUES (
    gen_random_uuid(),
    'admin@papertracker.local',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh7S',
    'ADMIN',
    NOW()
) ON CONFLICT (email) DO NOTHING;
-- Hash trên = BCrypt("admin123"). Đổi password sau deploy.
```

---

## 9. Gợi ý triển khai kỹ thuật

### pgvector + Spring Boot 3.3.x
```xml
<dependency>
    <groupId>io.hypersistence</groupId>
    <artifactId>hypersistence-utils-hibernate-65</artifactId>
    <version>3.8.3</version>
</dependency>
```

### ef_search — cấu hình global (không dùng SET LOCAL trong @Query)
```yaml
spring:
  datasource:
    hikari:
      connection-init-sql: "SET hnsw.ef_search = 128"
      maximum-pool-size: 20
```

### JWT
```xml
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-api</artifactId><version>0.12.6</version></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-impl</artifactId><version>0.12.6</version><scope>runtime</scope></dependency>
<dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-jackson</artifactId><version>0.12.6</version><scope>runtime</scope></dependency>
```

### Groq prompt mẫu
```
Bạn là trợ lý nghiên cứu. Với abstract sau, hãy trả về JSON:
- "summary": tóm tắt 3-5 câu tiếng Anh, tối đa 2000 ký tự
- "quality_score": float từ 0.0 đến 10.0

Abstract: {abstract}

Chỉ trả JSON thuần, không markdown.
```

### Validate Groq response
```java
if (resp.getQualityScore() < 0.0 || resp.getQualityScore() > 10.0)
    throw new GroqValidationException("quality_score out of range");
if (resp.getSummary() == null || resp.getSummary().isBlank())
    throw new GroqValidationException("summary is empty");
if (resp.getSummary().length() > 2000)
    throw new GroqValidationException("summary too long");
```

### MapStruct — enforce ignore embedding
```java
@Mapping(target = "embedding", ignore = true)
PaperDto toDto(Paper paper);

// Unit test bắt buộc
assertNull(paperMapper.toDto(paper).getEmbedding());
```

### REQUIRES_NEW — tránh connection pool exhaustion
```java
// Outer orchestrator — KHÔNG có @Transactional
public void processBatch(List<Paper> papers) {
    papers.forEach(paperAiService::processSingle);
}

// Inner — REQUIRES_NEW mở connection mới từ pool
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void processSingle(Paper paper) { ... }
```

---

## 10. Thống kê xu hướng
```sql
SELECT to_char(p.published_at, 'YYYY-MM') AS year_month, COUNT(*) AS paper_count
FROM paper_topic pt
JOIN paper p ON p.id = pt.paper_id
WHERE pt.topic_id = :topicId
  AND p.published_at >= NOW() - INTERVAL '2 years'
GROUP BY to_char(p.published_at, 'YYYY-MM')
ORDER BY year_month;
```
Dùng `idx_pt_stats (topic_id, paper_id)` + `idx_paper_published_at`.