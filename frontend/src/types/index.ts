export interface Paper {
  id: string;
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string; // plain string from backend, e.g. "A, B, C"
  published_at: string;
  paper_url: string;
  pdf_url: string;
  summary: string | null;
  quality_score: number | null;
  processing_status: 'PENDING' | 'DONE' | 'FAILED';
  retry_count: number;
  last_retry_at: string | null;
  is_duplicate: boolean;
  original_paper_id: string | null;
  last_error: string | null;
  topics: string[];
  is_favorite: boolean;
  created_at: string; // when the paper was fetched into our system (used for "Today" filter)
}

export interface Topic {
  id: string;
  name: string;
  keywords: string; // comma-separated
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Notification {
  id: string;
  type: 'NEW_PAPER';
  message: string;
  is_read: boolean;
  created_at: string;
  paper_id: string | null;
}

export interface TrendPoint {
  month: string; // "YYYY-MM"
  count: number;
}

export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

export interface JwtPayload {
  sub?: string;
  email?: string;
  user?: string;
  role?: string;
  exp?: number;
}

export interface User {
  email: string;
  initials: string;
  role: 'ADMIN' | 'USER';
}
