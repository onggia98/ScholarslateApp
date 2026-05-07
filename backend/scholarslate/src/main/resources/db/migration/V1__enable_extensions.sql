-- ============================================================
-- V1__enable_extensions.sql
-- PHẢI chạy trước V2. Nếu thiếu, cột vector(384) trong V2 sẽ fail.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Tuỳ chọn: bật pg_trgm nếu sau này cần ILIKE fuzzy search
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
