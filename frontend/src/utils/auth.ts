import type { JwtPayload, User } from '../types';

export function getStoredToken(): string | null {
  return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
}

export function clearAuth(): void {
  ['token', 'role'].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}

export function decodeJwt(token: string): JwtPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function emailToInitials(email: string): string {
  if (!email) return 'U';
  const local = String(email).split('@')[0] || '';
  const parts = local.split(/[._\-+]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return 'U';
}

export function getUserFromToken(token: string): User {
  const payload = decodeJwt(token);
  const email = (payload && (payload.email || payload.sub || payload.user)) || null;
  const role = (payload?.role === 'ADMIN' ? 'ADMIN' : 'USER') as User['role'];
  return {
    email: email || 'User',
    initials: email ? emailToInitials(email) : 'U',
    role,
  };
}
