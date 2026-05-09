# Scholarslate — Frontend

Giao diện web cho hệ thống Paper Tracker, xây dựng bằng **React 19 + Vite + TypeScript + Tailwind CSS v4**.

---

## Tech Stack

- **Framework**: React 19 + React Router v7
- **Build tool**: Vite 6
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4 (plugin `@tailwindcss/vite`)
- **Icons**: Lucide React
- **HTTP**: Fetch API (không dùng axios)

---

## Cấu trúc

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts          # Fetch helper, unwrap ApiResponse<T>.data, tất cả API calls
│   ├── pages/
│   │   ├── AuthPage.tsx       # Login + Register
│   │   └── DashboardPage.tsx  # Toàn bộ dashboard (Feed, Favorites, Search, Trends, Topics, Notifications)
│   ├── types/
│   │   └── index.ts           # Paper, Topic, Notification, TrendPoint, User interfaces
│   ├── utils/
│   │   ├── auth.ts            # JWT decode, getStoredToken, clearAuth, getUserFromToken
│   │   └── format.ts          # timeAgo, formatDate, authorString, scoreColor, normalizeStatus
│   ├── App.tsx                # BrowserRouter routing: /login → AuthPage, /dashboard → DashboardPage
│   ├── main.tsx
│   └── index.css              # Tailwind import
├── .env.development           # VITE_API_BASE_URL = Railway backend URL
├── vite.config.ts
├── tsconfig.app.json
└── package.json
```

---

## Chạy local

```bash
npm install
npm run dev
# http://localhost:5173
```

Frontend mặc định gọi Railway backend (`.env.development`). Để dùng local backend:

```bash
# Sửa .env.development
VITE_API_BASE_URL=http://localhost:8081/api
```

## Build production

```bash
npm run build
# Output: dist/
```

---

## Environment Variables

| Variable | Mô tả |
|---|---|
| `VITE_API_BASE_URL` | Base URL của backend API. Ví dụ: `https://scholarslateapp-production.up.railway.app/api` |

> Khi deploy lên Vercel/Netlify, set biến này trong dashboard của platform thay vì commit file `.env.production`.

---

## Pages & Features

### AuthPage (`/login`)
- Form đăng nhập và đăng ký
- Lưu JWT vào `localStorage`
- Redirect → `/dashboard` sau khi xác thực thành công

### DashboardPage (`/dashboard`)
- **Feed**: danh sách paper với filter theo status (All / Done / Pending / Failed) và topic
- **Favorites**: paper đã lưu yêu thích
- **Search**: full-text + vector search
- **Trends**: biểu đồ số paper theo tháng per topic
- **Topics**: quản lý topic (tạo, bật/tắt, xóa) — tối đa 10 topics
- **Notifications**: thông báo paper mới, click để navigate đến paper
- **Flagged**: paper trùng lặp/gần giống (duplicate detection)
- **Account modal**: xem profile, đổi mật khẩu
- **Paper card**: Share (copy link), More (copy arXiv ID / open arXiv / download PDF)
