-- ============================================================
-- V2__create_tables.sql
-- Tạo toàn bộ bảng cho hệ thống Paper Tracker.
-- Lưu ý: "user" là reserved keyword trong PostgreSQL → phải dùng dấu nháy kép.
-- ============================================================

-- Guard: đảm bảo pgvector đã được cài trước khi tạo bảng
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension not installed. Run V1__enable_extensions.sql first.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- Bảng USER
-- ------------------------------------------------------------
CREATE TABLE "user" (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    -- 'USER' | 'ADMIN' — enforced by CHECK constraint trong V3
    role          VARCHAR(10)  NOT NULL DEFAULT 'USER',
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Bảng TOPIC
-- ------------------------------------------------------------
CREATE TABLE topic (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL,
    -- Comma-separated, max 5 keywords, max 255 ký tự — kiểm soát tại tầng service
    keywords   VARCHAR(255),
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    user_id    UUID         NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Bảng PAPER
-- ------------------------------------------------------------
CREATE TABLE paper (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    arxiv_id           VARCHAR(50)  NOT NULL,
    title              TEXT         NOT NULL,
    -- Tên cột thực tế là "abstract" (không phải abstract_text như trong ERD diagram)
    abstract           TEXT,
    authors            TEXT,
    paper_url          VARCHAR(500),
    pdf_url            VARCHAR(500),
    summary            TEXT,
    -- NULL cho phép vì PENDING và DONE-duplicate không có score
    quality_score      FLOAT,
    -- vector(384) tương ứng model sentence-transformers/all-MiniLM-L6-v2
    embedding          vector(384),
    is_duplicate       BOOLEAN      NOT NULL DEFAULT FALSE,
    -- FK tự tham chiếu, ON DELETE SET NULL — xem V3
    original_paper_id  UUID,
    -- 'PENDING' | 'DONE' | 'FAILED' — enforced by CHECK constraint trong V3
    processing_status  VARCHAR(10)  NOT NULL DEFAULT 'PENDING',
    retry_count        INTEGER      NOT NULL DEFAULT 0,
    last_error         TEXT,
    -- Timestamp lần Retry Scheduler xử lý gần nhất. NULL nếu chưa từng retry.
    last_retry_at      TIMESTAMP WITH TIME ZONE,
    published_at       TIMESTAMP WITH TIME ZONE,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Bảng PAPER_TOPIC (bảng liên kết nhiều-nhiều)
-- PK tổng hợp — không có cột id riêng
-- ------------------------------------------------------------
CREATE TABLE paper_topic (
    paper_id   UUID NOT NULL,
    topic_id   UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (paper_id, topic_id)
);

-- ------------------------------------------------------------
-- Bảng FAVORITE
-- ------------------------------------------------------------
CREATE TABLE favorite (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    paper_id   UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Bảng NOTIFICATION
-- ------------------------------------------------------------
CREATE TABLE notification (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL,
    paper_id   UUID         NOT NULL,
    -- Chỉ có giá trị 'NEW_PAPER' — enforced by CHECK constraint trong V3
    type       VARCHAR(20)  NOT NULL DEFAULT 'NEW_PAPER',
    message    TEXT,
    is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
