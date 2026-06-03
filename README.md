# 📄 Paper Tracker (Scholarslate)

Hệ thống theo dõi, tóm tắt và quản lý bài báo khoa học từ **arXiv** theo chủ đề cá nhân — tích hợp AI embedding, semantic search và tự động hóa bằng scheduler.

🌐 **Backend (Railway):** https://scholarslateapp-production.up.railway.app/api  
🖥 **Frontend:** chạy local hoặc deploy lên Vercel/Netlify

---

## ✨ Tính năng chính

- 🔍 **Tự động fetch paper** từ arXiv theo keyword của từng topic, mỗi ngày lúc 6:00 sáng
- 🤖 **AI Pipeline**: tóm tắt abstract bằng Groq (LLaMA 3.1 8B Instant), tính embedding bằng HuggingFace (BAAI/bge-small-en-v1.5 — 384 dims), phát hiện paper trùng lặp bằng cosine similarity (ngưỡng 0.95)
- 📚 **Quản lý topic & paper**: tạo topic theo dõi (tối đa 10), lưu paper yêu thích, xem chi tiết + PDF
- 🔎 **Full-text search** (GIN index) và **semantic search** (pgvector HNSW index)
- 📊 **Thống kê xu hướng** số paper theo topic và tháng (YYYY-MM)
- 🔔 **Thông báo** real-time khi có paper mới phù hợp topic của user
- 🚩 **Flagged papers**: hiển thị paper trùng lặp/gần giống để người dùng xem xét
- 👤 **Account**: xem thông tin profile, đổi mật khẩu
- 🔄 **Retry Scheduler**: tự động retry paper bị lỗi AI pipeline, tối đa 3 lần

---

## 🛠 Tech Stack

| Layer | Công nghệ |
|---|---|
| **Backend** | Spring Boot 4.0.6, Java 21, Spring Security 6 (JWT stateless) |
| **Database** | PostgreSQL 16 + pgvector extension |
| **ORM & Migration** | Spring Data JPA, Hibernate 7.x, Flyway (V1–V5) |
| **AI** | Groq API (LLaMA 3.1 8B Instant), HuggingFace Inference API (BAAI/bge-small-en-v1.5) |
| **Cache** | Caffeine (in-memory, TTL 1 giờ) |
| **Frontend** | React 19, Vite 6 + TypeScript 5, Tailwind CSS v4, React Router v7 |
| **Deploy** | Railway (Backend + DB), Docker multi-stage |

---

## 📁 Cấu trúc dự án

```
paper-tracker/
├── backend/
│   └── scholarslate/              # Spring Boot application
│       ├── src/main/java/
│       │   └── com/nmcnpm/scholarslate/
│       │       ├── controller/    # REST controllers
│       │       ├── service/       # Business logic
│       │       ├── repository/    # Spring Data JPA repositories
│       │       ├── entity/        # JPA entities (Paper, Topic, User, …)
│       │       ├── dto/           # Request/Response DTOs
│       │       ├── mapper/        # Manual mappers (Paper → PaperResponse)
│       │       ├── security/      # JWT, SecurityConfig
│       │       └── scheduler/     # Main + Retry schedulers
│       ├── src/main/resources/
│       │   ├── db/migration/      # Flyway V1→V5
│       │   ├── application.yml    # Local config
│       │   └── application-prod.yml # Production config (Railway)
│       ├── Dockerfile             # Multi-stage build
│       └── railway.toml
├── database/
│   └── docker-compose.yml         # PostgreSQL 16 + pgvector (local dev)
├── frontend/                      # React app (Vite + TypeScript + Tailwind CSS v4)
│   ├── src/
│   │   ├── api/client.ts          # Fetch helper + tất cả API calls
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx       # Login + Register
│   │   │   └── DashboardPage.tsx  # Toàn bộ dashboard UI
│   │   ├── types/index.ts         # Paper, Topic, Notification, User interfaces
│   │   └── utils/                 # auth.ts, format.ts
│   ├── .env.development           # VITE_API_BASE_URL → Railway backend
│   └── vite.config.ts
└── docs/                          # Tài liệu thiết kế, ERD, use case
```

---

## 🚀 Chạy local

### Yêu cầu

- Java 21+, Maven (hoặc dùng `./mvnw`)
- Docker Desktop
- Node.js 20+, npm

### 1. Khởi động Database

```bash
cd database
docker compose up -d
# PostgreSQL chạy tại localhost:5433 với pgvector extension
```

### 2. Cấu hình secrets backend

Tạo file `backend/scholarslate/src/main/resources/application-local.yml`:

```yaml
app:
  groq:
    api-key: sk-...          # lấy tại console.groq.com
  huggingface:
    api-key: hf_...          # lấy tại huggingface.co/settings/tokens
  jwt:
    secret: <openssl rand -base64 32>
```

### 3. Chạy backend

```bash
cd backend/scholarslate
./mvnw spring-boot:run
# Backend chạy tại http://localhost:8081/api
# Flyway tự migrate V1→V5 khi khởi động lần đầu
```

### 4. Chạy frontend

```bash
cd frontend
npm install
npm run dev
# Frontend chạy tại http://localhost:5173
```

> Frontend trong dev mode gọi thẳng Railway backend (đã set trong `.env.development`).  
> Muốn dùng local backend: đổi `VITE_API_BASE_URL=http://localhost:8081/api`

### 5. Tài khoản admin mặc định

```
Email:    admin@papertracker.local
Password: *******
```

---

## 🌐 Deploy lên Railway (Backend)

Tóm tắt nhanh:
1. Push code lên GitHub
2. Tạo project trên [railway.app](https://railway.app)
3. Thêm service **Database** với image `pgvector/pgvector:pg16`
4. Thêm service **Backend** từ GitHub repo, set Root Directory: `backend/scholarslate`
5. Set env vars (xem bảng bên dưới)
6. Railway tự build Dockerfile và deploy, Flyway tự migrate

---

## 🔐 Environment Variables (Production)

| Variable | Mô tả | Bắt buộc |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` | ✅ |
| `JDBC_DATABASE_URL` | `jdbc:postgresql://HOST:PORT/papertracker` | ✅ |
| `JDBC_DATABASE_USERNAME` | Username DB | ✅ |
| `JDBC_DATABASE_PASSWORD` | Password DB | ✅ |
| `JWT_SECRET` | Chuỗi 256-bit base64 (`openssl rand -base64 32`) | ✅ |
| `GROQ_API_KEY` | API key từ Groq console | ✅ |
| `HUGGINGFACE_API_KEY` | Token từ HuggingFace | ✅ |
| `FRONTEND_URL` | URL frontend production (cho CORS, ví dụ: `https://your-app.vercel.app`) — **Bắt buộc**, thiếu → CORS block toàn bộ request từ frontend | ✅ |

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
- Tất cả PKs dùng UUID

---

## 📡 API Endpoints

### Auth (Public)
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký, nhận JWT |
| POST | `/api/auth/login` | Đăng nhập, nhận JWT |

### Papers (🔒 JWT required)
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/papers` | Danh sách paper (filter: status, topicId, search) |
| GET | `/api/papers/{id}` | Chi tiết paper |
| GET | `/api/papers/search?q=` | Full-text + vector search |
| GET | `/api/papers/favorites` | Danh sách paper yêu thích |
| POST | `/api/papers/{id}/favorite` | Thêm vào favorites |
| DELETE | `/api/papers/{id}/favorite` | Xóa khỏi favorites |
| GET | `/api/papers/stats/trend?topicId=` | Thống kê paper theo tháng |

### Topics (🔒 JWT required)
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/topics` | Danh sách topic của user |
| POST | `/api/topics` | Tạo topic mới |
| PUT | `/api/topics/{id}` | Cập nhật topic |
| DELETE | `/api/topics/{id}` | Xóa topic |

### Users (🔒 JWT required)
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/users/me` | Thông tin profile |
| PATCH | `/api/users/me/password` | Đổi mật khẩu |

### Notifications (🔒 JWT required)
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/notifications` | Danh sách thông báo |
| PATCH | `/api/notifications/{id}/read` | Đánh dấu đã đọc |
| PATCH | `/api/notifications/read-all` | Đánh dấu tất cả đã đọc |

### Admin (🔒 ADMIN role)
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/admin/papers/failed` | Danh sách paper lỗi (paged) |
| POST | `/api/admin/papers/{id}/reset` | Reset 1 paper FAILED |
| POST | `/api/admin/papers/reset-all-failed` | Bulk reset tất cả FAILED |
| POST | `/api/admin/pipeline/trigger` | Trigger Main Pipeline thủ công |
| POST | `/api/admin/pipeline/retry` | Trigger RetryScheduler thủ công |

### System
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/actuator/health` | Health check |

---

## ⚙️ Scheduler

| Job | Lịch chạy | Mô tả |
|---|---|---|
| **Main Scheduler** | 6:00 sáng hàng ngày | Fetch paper mới từ arXiv theo active topics, delay 1.5s/request |
| **Retry Scheduler** | Mỗi 30 phút | Retry paper `FAILED`, tối đa 3 lần, ghi log `last_error` |

---

## 👥 Team

Đồ án môn Nhập môn Công nghệ Phần mềm — HCMUS, HK3 2025–2026
