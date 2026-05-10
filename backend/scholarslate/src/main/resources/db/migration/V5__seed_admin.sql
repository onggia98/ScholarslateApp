-- ============================================================
-- V5__seed_admin.sql
-- Bootstrap ADMIN user cho hệ thống.
-- Credentials được quản lý ngoài repo (env vars / secret manager).
-- ============================================================

INSERT INTO "user" (id, email, password_hash, role, created_at)
VALUES (
    gen_random_uuid(),
    'admin@papertracker.local',
    '$2b$10$Em.twMj2evqFXaeqwBpT.exU6VbUmFV7WZN7wDS0QQWp3BmSXiLkC',
    'ADMIN',
    NOW()
)
-- Idempotent: chạy lại migration không bị lỗi nếu admin đã tồn tại
ON CONFLICT (email) DO NOTHING;
