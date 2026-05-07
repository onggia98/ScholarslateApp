# 📄 Paper Tracker (Scholarslate)

Hệ thống theo dõi, tóm tắt và quản lý bài báo khoa học từ **arXiv** theo chủ đề cá nhân — tích hợp AI embedding, semantic search và tự động hóa bằng scheduler.

---

## ✨ Tính năng chính

- 🔍 **Tự động fetch paper** từ arXiv theo keyword của từng topic, mỗi ngày lúc 6:00 sáng
- 🤖 **AI Pipeline**: tóm tắt abstract bằng Groq (LLaMA 3), tính embedding bằng HuggingFace, phát hiện paper trùng lặp bằng cosine similarity
- 📚 **Quản lý topic & paper**: tạo topic theo dõi, lưu paper yêu thích, xem chi tiết + PDF
- 🔎 **Full-text search** (GIN index) và **semantic search** (HNSW vector index)
- 📊 **Thống kê xu hướng** theo chủ đề và thời gian
- 🔔 **Thông báo** khi có paper mới phù hợp topic
- 💡 **Gợi ý paper liên quan** real-time khi xem chi tiết (cached 1 giờ)
- 🔄 **Retry Scheduler**: tự động retry paper bị lỗi AI pipeline, tối đa 3 lần

---

## 🛠 Tech Stack

| Layer | Công nghệ |
|---|---|
| **Backend** | Spring Boot 4.0.6, Java 21, Spring Security 6 (JWT stateless) |
| **Database** | PostgreSQL 16 + pgvector extension |
| **ORM & Migration** | Spring Data JPA, Hibernate 7.x, Flyway |
| **AI** | Groq API (LLaMA 3.1 8B), HuggingFace Inference API (BAAI/bge-small-en-v1.5) |
| **Cache** | Caffeine (in-memory, TTL 1 giờ) |
| **Frontend** | ReactJS, Vite + TypeScript, Tailwind CSS |
| **Deploy** | Railway (Backend + DB), Docker |

---

## 📁 Cấu trúc dự án

```
paper-tracer/
├── backend/
│   └── scholarslate/          # Spring Boot application
│       ├── src/main/java/     # Controllers, Services, Repositories, Entities
│       ├── src/main/resources/
│       │   ├── db/migration/  # Flyway V1→V5
│       │   ├── application.yml
│       │   └── application-prod.yml
│       ├── Dockerfile
│       └── railway.toml
├── database/
│   └── docker-compose.yml     # PostgreSQL + pgvector (local dev)
├── frontend/                  # ReactJS app (Vite + TypeScript)
└── docs/                      # Tài liệu thiết kế, ERD, use case
```

---

## 🚀 Chạy local (Development)

### Yêu cầu

- Java 21+
- Docker Desktop
- Maven (hoặc dùng `./mvnw` đính kèm)

### 1. Khởi động Database

```bash
cd database
docker compose up -d
```

PostgreSQL sẽ chạy ở `localhost:5433` với pgvector extension.

### 2. Cấu hình secrets

```bash
cd backend/scholarslate/src/main/resources
cp application-local.yml.example application-local.yml
# Mở application-local.yml và điền API keys thật
```

Các giá trị cần điền:

| Biến | Lấy tại |
|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys |
| `HUGGINGFACE_API_KEY` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| `DB_PASSWORD` | Mặc định: `papertracker123` (theo docker-compose) |
| `JWT_SECRET` | Tự sinh: `openssl rand -base64 32` |

### 3. Chạy backend

```bash
cd backend/scholarslate
./mvnw spring-boot:run
```

Backend chạy tại: `http://localhost:8081/api`

Flyway tự động chạy migration V1 → V5 khi khởi động lần đầu.

### 4. Tài khoản admin mặc định

```
Email:    admin@papertracker.local
Password: admin123
```

> ⚠️ Đổi password ngay sau khi deploy production.

---

## 🌐 Deploy lên Railway (Production)

Xem hướng dẫn chi tiết: [`docs/DEPLOY.md`](docs/DEPLOY.md)

Tóm tắt nhanh:
1. Push code lên GitHub
2. Tạo project trên [railway.app](https://railway.app)
3. Thêm service Database với image `pgvector/pgvector:pg16`
4. Thêm service Backend từ GitHub repo, set Root Directory: `backend/scholarslate`
5. Set các env vars: `SPRING_PROFILES_ACTIVE=prod`, `JDBC_DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`, `HUGGINGFACE_API_KEY`
6. Railway tự build Dockerfile và deploy. Flyway tự migrate.

---

## 🔐 Environment Variables (Production)

| Variable | Mô tả | Bắt buộc |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | Đặt là `prod` | ✅ |
| `JDBC_DATABASE_URL` | `jdbc:postgresql://HOST:PORT/papertracker` | ✅ |
| `JDBC_DATABASE_USERNAME` | Username DB | ✅ |
| `JDBC_DATABASE_PASSWORD` | Password DB | ✅ |
| `JWT_SECRET` | Chuỗi 256-bit base64, sinh bằng `openssl rand -base64 32` | ✅ |
| `GROQ_API_KEY` | API key từ Groq console | ✅ |
| `HUGGINGFACE_API_KEY` | Token từ HuggingFace | ✅ |
| `FRONTEND_URL` | URL production của frontend (cho CORS) | Nên có |

---

## 🗄 Database Schema

5 bảng chính, quản lý bởi Flyway:

```
USER ──< TOPIC ──< PAPER_TOPIC >── PAPER
USER ──< FAVORITE >──────────────── PAPER
USER ──< NOTIFICATION
PAPER ──(self-ref)── PAPER (original_paper_id)
```

- **PAPER** có cột `embedding vector(384)` — dùng HNSW index cho similarity search
- **PAPER** có GIN full-text index trên `title + abstract + authors`

---

## 📡 API Endpoints

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Đăng ký | Public |
| POST | `/api/auth/login` | Đăng nhập, nhận JWT | Public |
| GET | `/api/topics` | Danh sách topic của user | 🔒 |
| POST | `/api/topics` | Tạo topic mới | 🔒 |
| GET | `/api/papers` | Tìm kiếm / lọc paper | 🔒 |
| GET | `/api/papers/{id}` | Chi tiết paper | 🔒 |
| GET | `/api/papers/{id}/recommendations` | Paper liên quan | 🔒 |
| POST | `/api/favorites` | Lưu paper yêu thích | 🔒 |
| GET | `/api/notifications` | Danh sách thông báo | 🔒 |
| GET | `/api/admin/stats` | Thống kê hệ thống | 🔒 ADMIN |
| GET | `/api/actuator/health` | Health check | Public |

---

## ⚙️ Scheduler

| Job | Lịch chạy | Mô tả |
|---|---|---|
| **Main Scheduler** | 6:00 sáng hàng ngày | Fetch paper mới từ arXiv theo active topics |
| **Retry Scheduler** | Mỗi 30 phút | Retry paper có `processing_status = FAILED`, tối đa 3 lần |

---

## 👥 Team

Đồ án môn Nhập môn Công nghệ Phần mềm — HCMUS
