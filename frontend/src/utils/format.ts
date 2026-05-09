export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function authorString(authors: string | string[]): string {
  if (!authors) return '';
  const parts = Array.isArray(authors)
    ? authors
    : String(authors).split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 3) return parts.join(', ');
  return parts.slice(0, 3).join(', ') + ' +' + (parts.length - 3);
}

export function authorsLower(authors: string | string[]): string {
  if (!authors) return '';
  if (Array.isArray(authors)) return authors.join(' ').toLowerCase();
  return String(authors).toLowerCase();
}

export function scoreColor(score: number | null) {
  if (score == null)
    return { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-400' };
  if (score >= 8)
    return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' };
  if (score >= 5)
    return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' };
  return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' };
}

export function kwCount(keywords: string | undefined): number {
  if (!keywords) return 0;
  return keywords.split(',').map((s) => s.trim()).filter(Boolean).length;
}

/** Normalize backend processing_status: COMPLETED → DONE */
export function normalizeStatus(status: string): string {
  return status === 'COMPLETED' ? 'DONE' : status;
}
