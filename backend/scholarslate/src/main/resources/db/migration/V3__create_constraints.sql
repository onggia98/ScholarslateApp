-- ============================================================
-- V3__create_constraints.sql
-- Thêm Unique, Foreign Key, và Check constraints cho tất cả bảng.
-- ============================================================

-- ------------------------------------------------------------
-- UNIQUE CONSTRAINTS
-- ------------------------------------------------------------

-- USER: mỗi email chỉ đăng ký một lần
ALTER TABLE "user"
    ADD CONSTRAINT uq_user_email UNIQUE (email);

-- TOPIC: không cho phép hai topic trùng tên trong cùng một user
ALTER TABLE topic
    ADD CONSTRAINT uq_topic_user_name UNIQUE (user_id, name);

-- PAPER: tránh lưu trùng paper từ arXiv
ALTER TABLE paper
    ADD CONSTRAINT uq_paper_arxiv_id UNIQUE (arxiv_id);

-- FAVORITE: mỗi user chỉ lưu favorite một paper một lần
-- PostgreSQL tự tạo index vật lý cho UNIQUE này → không cần B-tree index riêng
ALTER TABLE favorite
    ADD CONSTRAINT uq_favorite UNIQUE (user_id, paper_id);

-- NOTIFICATION: mỗi user nhận tối đa một NEW_PAPER notification cho mỗi paper
ALTER TABLE notification
    ADD CONSTRAINT uq_notification UNIQUE (user_id, paper_id, type);

-- ------------------------------------------------------------
-- FOREIGN KEY CONSTRAINTS
-- ------------------------------------------------------------

-- TOPIC → USER
ALTER TABLE topic
    ADD CONSTRAINT fk_topic_user
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

-- PAPER → PAPER (self-referential cho duplicate detection)
ALTER TABLE paper
    ADD CONSTRAINT fk_paper_original
    FOREIGN KEY (original_paper_id) REFERENCES paper(id) ON DELETE SET NULL;

-- PAPER_TOPIC → PAPER
ALTER TABLE paper_topic
    ADD CONSTRAINT fk_pt_paper
    FOREIGN KEY (paper_id) REFERENCES paper(id) ON DELETE CASCADE;

-- PAPER_TOPIC → TOPIC (xóa topic → xóa cascade paper_topic, nhưng PAPER vẫn còn)
ALTER TABLE paper_topic
    ADD CONSTRAINT fk_pt_topic
    FOREIGN KEY (topic_id) REFERENCES topic(id) ON DELETE CASCADE;

-- FAVORITE → USER
ALTER TABLE favorite
    ADD CONSTRAINT fk_favorite_user
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

-- FAVORITE → PAPER
ALTER TABLE favorite
    ADD CONSTRAINT fk_favorite_paper
    FOREIGN KEY (paper_id) REFERENCES paper(id) ON DELETE CASCADE;

-- NOTIFICATION → USER
ALTER TABLE notification
    ADD CONSTRAINT fk_notification_user
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

-- NOTIFICATION → PAPER
ALTER TABLE notification
    ADD CONSTRAINT fk_notification_paper
    FOREIGN KEY (paper_id) REFERENCES paper(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- CHECK CONSTRAINTS
-- ------------------------------------------------------------

-- USER.role chỉ nhận USER hoặc ADMIN
ALTER TABLE "user"
    ADD CONSTRAINT chk_user_role
    CHECK (role IN ('USER', 'ADMIN'));

-- PAPER.processing_status chỉ nhận 3 trạng thái pipeline
ALTER TABLE paper
    ADD CONSTRAINT chk_processing_status
    CHECK (processing_status IN ('PENDING', 'DONE', 'FAILED'));

-- PAPER.quality_score: NULL cho phép (PENDING / DONE-duplicate chưa có score)
-- Khi có giá trị phải nằm trong [0.0, 10.0]
ALTER TABLE paper
    ADD CONSTRAINT chk_quality_score
    CHECK (quality_score IS NULL OR (quality_score >= 0.0 AND quality_score <= 10.0));

-- NOTIFICATION.type hiện chỉ hỗ trợ NEW_PAPER
ALTER TABLE notification
    ADD CONSTRAINT chk_notification_type
    CHECK (type IN ('NEW_PAPER'));
