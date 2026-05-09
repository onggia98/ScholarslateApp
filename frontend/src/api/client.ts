import { getStoredToken } from '../utils/auth';
import type { Paper, Topic, Notification, TrendPoint, PagedResponse } from '../types';

// In dev: VITE_API_BASE_URL is unset → uses relative '/api' → Vite proxy → localhost:8081 (no CORS)
// In prod: set VITE_API_BASE_URL to the deployed backend URL (e.g. Railway)
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Generic fetch helper.
 * Backend wraps ALL responses in ApiResponse<T>: { success, message, data: T }
 * This function unwraps `.data` automatically.
 * 204 No Content → returns undefined.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) throw new ApiError(401, 'Unauthorized');
  if (res.status === 204) return undefined as T;

  const body = await res.json();

  if (!res.ok) {
    // Backend error: { success: false, message: "..." }
    const msg = body?.message || 'Request failed: ' + res.status;
    throw new ApiError(res.status, msg);
  }

  // Unwrap ApiResponse<T> → return body.data
  // If backend returns raw JSON (no wrapper), fall back to body itself
  if (body !== null && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string): Promise<{ token: string }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiRegister(email: string, password: string): Promise<{ token: string }> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ── Papers ────────────────────────────────────────────────────────────────────

export async function fetchPapers(): Promise<Paper[]> {
  const data = await request<Paper[] | PagedResponse<Paper>>('/papers');
  if (Array.isArray(data)) return data;
  return (data as PagedResponse<Paper>).content ?? [];
}

export async function fetchPaperById(id: string): Promise<Paper> {
  return request('/papers/' + encodeURIComponent(id));
}

// UC14 — Recommendation top-10 theo paper_id, cached 1h phía backend
export async function fetchRecommendations(id: string): Promise<Paper[]> {
  const data = await request<Paper[] | PagedResponse<Paper>>(
    '/papers/' + encodeURIComponent(id) + '/recommendations'
  );
  if (Array.isArray(data)) return data;
  return (data as PagedResponse<Paper>).content ?? [];
}

export async function searchPapers(q: string): Promise<Paper[]> {
  const data = await request<Paper[] | PagedResponse<Paper>>(
    '/papers/search?q=' + encodeURIComponent(q)
  );
  if (Array.isArray(data)) return data;
  return (data as PagedResponse<Paper>).content ?? [];
}

export async function fetchTrend(topicId: string): Promise<TrendPoint[]> {
  return request('/papers/stats/trend?topicId=' + encodeURIComponent(topicId));
}

// ── Favorites ─────────────────────────────────────────────────────────────────
// Backend: FavoriteController @ /api/papers
// GET    /papers/favorites          → list
// POST   /papers/{paperId}/favorite → add (paperId in path, no body)
// DELETE /papers/{paperId}/favorite → remove (returns 204)

export async function fetchFavorites(): Promise<Paper[]> {
  const data = await request<Paper[] | PagedResponse<Paper>>('/papers/favorites');
  if (Array.isArray(data)) return data;
  return (data as PagedResponse<Paper>).content ?? [];
}

export async function addFavorite(paperId: string): Promise<void> {
  return request('/papers/' + encodeURIComponent(paperId) + '/favorite', { method: 'POST' });
}

export async function removeFavorite(paperId: string): Promise<void> {
  return request('/papers/' + encodeURIComponent(paperId) + '/favorite', { method: 'DELETE' });
}

// ── User Profile ──────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export async function fetchProfile(): Promise<UserProfile> {
  return request('/users/me');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request('/users/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

// ── Topics ────────────────────────────────────────────────────────────────────

export async function fetchTopics(): Promise<Topic[]> {
  return request('/topics');
}

export async function createTopic(payload: { name: string; keywords: string }): Promise<Topic> {
  return request('/topics', {
    method: 'POST',
    body: JSON.stringify({ ...payload, is_active: true }),
  });
}

export async function updateTopic(id: string, payload: Partial<Topic>): Promise<Topic | null> {
  return request('/topics/' + encodeURIComponent(id), {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteTopic(id: string): Promise<void> {
  return request('/topics/' + encodeURIComponent(id), { method: 'DELETE' });
}

// ── Admin (UC17) ──────────────────────────────────────────────────────────────
// All endpoints require role=ADMIN — backend enforces via @PreAuthorize

export async function fetchFailedPapers(page = 0, size = 20): Promise<PagedResponse<Paper>> {
  return request(`/admin/papers/failed?page=${page}&size=${size}`);
}

export async function resetFailedPaper(id: string): Promise<void> {
  return request(`/admin/papers/${encodeURIComponent(id)}/reset`, { method: 'POST' });
}

export async function resetAllFailedPapers(): Promise<void> {
  return request('/admin/papers/reset-all-failed', { method: 'POST' });
}

export async function triggerPipeline(): Promise<void> {
  return request('/admin/pipeline/trigger', { method: 'POST' });
}

export async function triggerRetry(): Promise<void> {
  return request('/admin/pipeline/retry', { method: 'POST' });
}

// ── Notifications ─────────────────────────────────────────────────────────────
// Backend uses PATCH (not PUT) for mark-read endpoints

export async function fetchNotifications(): Promise<Notification[]> {
  const data = await request<Notification[] | PagedResponse<Notification>>('/notifications');
  if (Array.isArray(data)) return data;
  return (data as PagedResponse<Notification>).content ?? [];
}

export async function markAllNotificationsRead(): Promise<void> {
  return request('/notifications/read-all', { method: 'PATCH' });
}

export async function markNotificationRead(id: string): Promise<void> {
  return request('/notifications/' + encodeURIComponent(id) + '/read', { method: 'PATCH' });
}
