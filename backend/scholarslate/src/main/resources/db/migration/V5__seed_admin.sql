-- ============================================================
-- V5__seed_admin.sql
-- Bootstrap ADMIN user cho hệ thống.
-- ⚠️  QUAN TRỌNG: Đổi password ngay sau khi deploy lần đầu!
-- ============================================================

-- Password mặc định: admin123
-- BCrypt hash (cost=10) — generate bằng: new BCryptPasswordEncoder(10).encode("admin123")
-- Để generate hash mới trong Java:
--   System.out.println(new BCryptPasswordEncoder(10).encode("your_new_password"));
-- Hoặc dùng online tool: https://bcrypt-generator.com (cost factor = 10)

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
