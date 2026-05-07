-- ============================================================
-- V4__create_indexes.sql
-- Tạo toàn bộ index: B-tree, HNSW (vector), và GIN (full-text).
-- HNSW và GIN là Day-1 mandatory — thiếu sẽ gây full-table scan.
-- ============================================================

-- ------------------------------------------------------------
-- HNSW VECTOR INDEX — bắt buộc Day 1
-- Dùng cho duplicate detection (cosine distance < 0.05)
-- và recommendation (cosine distance < 0.5).
-- Toán học: <=> trả về cosine DISTANCE (0–1), không phải similarity.
--   Distance = 1 − Similarity. Ví dụ: similarity 0.95 → distance 0.05.
-- ef_search = 128 được set global qua HikariCP connection-init-sql
--   trong application.yml (không cần SET LOCAL trong từng query).
-- ------------------------------------------------------------
CREATE INDEX idx_paper_embedding_hnsw
    ON paper
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ------------------------------------------------------------
-- GIN FULL-TEXT INDEXES — bắt buộc Day 1
-- QUAN TRỌNG: Phải tạo 2 index riêng biệt vì UC05 và UC12
-- dùng expression KHÁC NHAU. PostgreSQL chỉ dùng functional index
-- khi expression trong query khớp HOÀN TOÀN với expression trong index.
-- ------------------------------------------------------------

-- Index 1: UC05 Full-text Search — title + abstract + authors
-- Dùng plainto_tsquery (AND logic, linh hoạt, hỗ trợ tìm theo tên tác giả)
CREATE INDEX idx_paper_fts_search
    ON paper
    USING gin (
        to_tsvector('english',
            coalesce(title, '') || ' ' ||
            coalesce(abstract, '') || ' ' ||
            coalesce(authors, '')
        )
    );

-- Index 2: UC12 Topic Matching — chỉ title + abstract (KHÔNG có authors)
-- Dùng phraseto_tsquery (exact phrase). Keyword topic là chủ đề nghiên cứu,
-- không phải tên người → bỏ authors để tránh false positive.
CREATE INDEX idx_paper_fts_topic
    ON paper
    USING gin (
        to_tsvector('english',
            coalesce(title, '') || ' ' ||
            coalesce(abstract, '')
        )
    );

-- ------------------------------------------------------------
-- B-TREE INDEXES — PAPER
-- ------------------------------------------------------------
-- Sort và filter danh sách paper theo ngày
CREATE INDEX idx_paper_published_at   ON paper(published_at);

-- Retry Scheduler query: WHERE processing_status = 'FAILED' AND retry_count < 3
CREATE INDEX idx_paper_status         ON paper(processing_status);

-- Filter cho recommendation: WHERE is_duplicate = false
CREATE INDEX idx_paper_is_duplicate   ON paper(is_duplicate);

-- Tra cứu paper gốc khi hiển thị duplicate info
CREATE INDEX idx_paper_original       ON paper(original_paper_id);

-- ------------------------------------------------------------
-- B-TREE INDEXES — PAPER_TOPIC
-- ------------------------------------------------------------
-- Join từ topic sang paper (truy vấn paper của 1 topic)
CREATE INDEX idx_pt_topic_id ON paper_topic(topic_id);

-- Join từ paper sang topic (truy vấn topic của 1 paper)
CREATE INDEX idx_pt_paper_id ON paper_topic(paper_id);

-- Composite index tối ưu UC15 trend stats: GROUP BY topic + published_at
CREATE INDEX idx_pt_stats    ON paper_topic(topic_id, paper_id);

-- ------------------------------------------------------------
-- B-TREE INDEXES — TOPIC
-- ------------------------------------------------------------
-- Scheduler load active topics: WHERE user_id = ? AND is_active = true
CREATE INDEX idx_topic_user_active ON topic(user_id, is_active);

-- Unique constraint (user_id, name) đã tạo index tự động trong V3
-- → KHÔNG tạo thêm để tránh 2 index vật lý trùng nhau

-- ------------------------------------------------------------
-- B-TREE INDEXES — NOTIFICATION
-- ------------------------------------------------------------
-- Notification list query: WHERE user_id = ? ORDER BY is_read, created_at
CREATE INDEX idx_notification_user_read ON notification(user_id, is_read, created_at);

-- ------------------------------------------------------------
-- Ghi chú FAVORITE:
-- UNIQUE constraint (user_id, paper_id) trong V3 đã tạo index B-tree tự động.
-- Không khai báo thêm để tránh 2 index vật lý trùng nhau.
-- ------------------------------------------------------------
