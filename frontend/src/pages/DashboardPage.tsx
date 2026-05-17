import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSearch, LayoutGrid, Heart, Bell, Search, TrendingUp, Settings2, Plus, X,
  ChevronDown, Menu, RefreshCw, AlertTriangle, AlertCircle, Copy, Hash, Calendar,
  Users, Tag, Sparkles, FileText, Loader2, CheckCheck, ArrowRight, Inbox, SearchX,
  Share2, MoreHorizontal, LogOut, Trash2, User, KeyRound, ShieldCheck, BookOpen,
} from 'lucide-react';
import {
  fetchPapers, fetchPaperById, fetchRecommendations, searchPapers, fetchFavorites, addFavorite, removeFavorite,
  fetchProfile, changePassword,
  type UserProfile,
  fetchTopics, createTopic, updateTopic, deleteTopic,
  fetchNotifications, markAllNotificationsRead, markNotificationRead,
  fetchTrend,
} from '../api/client';
import { getStoredToken, clearAuth, getUserFromToken } from '../utils/auth';
import { timeAgo, formatDate, authorString, authorsLower, scoreColor, kwCount, normalizeStatus } from '../utils/format';
import type { Paper, Topic, Notification, TrendPoint, User as UserType } from '../types';

const TOPIC_LIMIT = 10;

// ── Tiny atoms ───────────────────────────────────────────────────────────────

type Tone = 'slate' | 'blue' | 'amber' | 'rose' | 'emerald' | 'indigo';
function Badge({ children, tone = 'slate' as Tone, icon: Icon, className = '' }: { children: React.ReactNode; tone?: Tone; icon?: React.ElementType; className?: string }) {
  const tones: Record<Tone, string> = {
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };
  return (
    <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ' + tones[tone] + ' ' + className}>
      {Icon ? <Icon className="w-3 h-3" /> : null}{children}
    </span>
  );
}


function PageHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start sm:items-end justify-between mb-4 sm:mb-5 gap-3">
      <div className="min-w-0">
        <h1 className="text-[18px] sm:text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="text-xs sm:text-sm text-slate-500 mt-0.5 line-clamp-2 sm:line-clamp-none">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body, action }: { icon: React.ElementType; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="py-16 text-center border border-dashed border-slate-200 rounded-xl bg-white">
      <div className="w-12 h-12 rounded-full bg-slate-100 inline-flex items-center justify-center text-slate-400 mb-3"><Icon className="w-5 h-5" /></div>
      <div className="text-sm font-medium text-slate-700">{title}</div>
      {body ? <div className="mt-1 text-[13px] text-slate-500 max-w-sm mx-auto">{body}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-sm font-semibold text-rose-800">{message}</div>
        <div className="text-xs text-rose-700/80 mt-1">Check your connection and try refreshing.</div>
      </div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin" /><span className="text-sm">{label}</span>
    </div>
  );
}

// ── PaperCard ────────────────────────────────────────────────────────────────

function PaperCard({ paper, onToggleFavorite, focused, onFocusConsumed, onOpenDetail }: { paper: Paper; onToggleFavorite: (id: string) => void; focused?: boolean; onFocusConsumed?: () => void; onOpenDetail?: (paper: Paper) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [flash, setFlash] = useState(false);
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  // Close More dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(paper.paper_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: open the URL if clipboard not available
      window.open(paper.paper_url, '_blank');
    }
  };
  const score = scoreColor(paper.quality_score);
  const isFailed = paper.processing_status === 'FAILED';

  useEffect(() => {
    if (focused) {
      setExpanded(true); setFlash(true);
      const el = cardRef.current;
      if (el) {
        const scroller = el.closest('.feed-scroll') || el.parentElement;
        if (scroller && 'scrollTo' in scroller) (scroller as HTMLElement).scrollTo({ top: (el as HTMLElement).offsetTop - 16, behavior: 'smooth' });
      }
      // After highlight fades, only clear the flash — keep card expanded for reading
      const t = setTimeout(() => { setFlash(false); onFocusConsumed?.(); }, 1800);
      return () => clearTimeout(t);
    } else {
      // Only clear flash; do NOT collapse — user may be reading the expanded card
      setFlash(false);
    }
  }, [focused]);

  return (
    <article ref={cardRef} data-paper-id={paper.id}
      className={'bg-white border rounded-xl overflow-hidden transition-all hover:shadow-sm ' + (flash ? 'ring-2 ring-slate-900/30 shadow-md ' : '') + (isFailed ? 'border-rose-200' : paper.is_duplicate ? 'border-amber-200' : 'border-slate-200')}>
      {isFailed ? (
        <div className="px-5 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-xs text-rose-800">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-semibold">AI processing failed</span>
          <span className="text-rose-700/80 truncate">· {paper.last_error}</span>
          <span className="ml-auto text-[11px] text-rose-700/80 flex-shrink-0">retry {paper.retry_count}/3 · last {paper.last_retry_at ? timeAgo(paper.last_retry_at) : '—'}</span>
        </div>
      ) : null}
      {paper.is_duplicate ? (
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-800">
          <Copy className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-semibold">Duplicate detected</span>
          <span className="text-amber-700/80 truncate">· cosine distance &lt; 0.05</span>
        </div>
      ) : null}
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={'flex flex-col items-center justify-center w-12 sm:w-14 flex-shrink-0 rounded-lg border py-2 ' + score.bg + ' ' + score.border}>
            <div className={'text-[10px] font-semibold uppercase tracking-wider ' + score.text}>AI</div>
            <div className={'text-lg sm:text-xl font-bold leading-none ' + score.text}>{paper.quality_score != null ? paper.quality_score.toFixed(1) : '—'}</div>
            <div className={'text-[9px] opacity-70 mt-0.5 ' + score.text}>/ 10</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mb-1.5">
              <span className="inline-flex items-center gap-1 font-mono text-slate-600"><Hash className="w-3 h-3" />{paper.arxiv_id}</span>
              <span className="text-slate-300 hidden sm:inline">·</span>
              <span className="hidden sm:inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(paper.published_at)}</span>
              <span className="text-slate-300">·</span>
              <span>{timeAgo(paper.published_at)}</span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{authorString(paper.authors)}</span>
            </div>
            <h3 className="text-[17px] font-semibold text-slate-900 leading-snug tracking-tight mb-2 text-pretty">
              <a href={paper.paper_url} target="_blank" rel="noopener noreferrer" className="hover:underline decoration-slate-300 underline-offset-2">{paper.title}</a>
            </h3>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[...new Set(paper.topics ?? [])].map(t => <Badge key={t} tone="indigo" icon={Tag}>{t}</Badge>)}
              {paper.processing_status === 'PENDING' ? <Badge tone="blue" icon={Loader2}>Processing…</Badge> : null}
            </div>
            <div className="mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Abstract</div>
              <p className={'text-sm text-slate-600 leading-relaxed ' + (expanded ? '' : 'line-clamp-3')}>{paper.abstract}</p>
            </div>
            {paper.summary ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-slate-700" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">AI Summary</span>
                  <span className="text-[10px] text-slate-500 ml-1">· llama-3.1-8b-instant</span>
                  <span className={'ml-auto inline-flex items-center gap-1 text-[11px] font-medium ' + score.text}>
                    <span className={'w-1.5 h-1.5 rounded-full ' + score.dot} />Quality {paper.quality_score?.toFixed(1)}
                  </span>
                </div>
                <p className={'text-sm text-slate-700 leading-relaxed ' + (expanded ? '' : 'line-clamp-3')}>{paper.summary}</p>
              </div>
            ) : isFailed ? (
              <div className="rounded-lg bg-rose-50/60 border border-dashed border-rose-200 p-3.5 text-sm text-rose-700/90 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />AI summary unavailable — Retry Scheduler will attempt again automatically.
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button onClick={() => onToggleFavorite(paper.id)}
                className={'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ' + (paper.is_favorite ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50')}>
                <Heart className={'w-4 h-4 ' + (paper.is_favorite ? 'fill-rose-500 text-rose-500' : '')} />
                {paper.is_favorite ? 'Saved' : 'Favorite'}
              </button>
              <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
                <FileText className="w-4 h-4" />Read PDF
              </a>
              {onOpenDetail ? (
                <button onClick={() => onOpenDetail(paper)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">
                  <BookOpen className="w-4 h-4" />Details
                </button>
              ) : null}
              <button onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-1 h-9 px-2 text-sm text-slate-500 hover:text-slate-900">
                {expanded ? 'Show less' : 'Show more'}<ChevronDown className={'w-4 h-4 transition-transform ' + (expanded ? 'rotate-180' : '')} />
              </button>
              <div className="ml-auto flex items-center gap-1">
                {/* Share — copy paper link to clipboard */}
                <button onClick={handleShare} title={copied ? 'Copied!' : 'Copy link'}
                  className={'relative inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ' + (copied ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50')}>
                  {copied ? <CheckCheck className="w-[18px] h-[18px]" /> : <Share2 className="w-[18px] h-[18px]" />}
                </button>
                {/* More (⋯) — dropdown with extra actions */}
                <div className="relative" ref={moreRef}>
                  <button onClick={() => setMoreOpen(o => !o)} title="More actions"
                    className={'inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ' + (moreOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50')}>
                    <MoreHorizontal className="w-[18px] h-[18px]" />
                  </button>
                  {moreOpen && (
                    <div className="absolute right-0 bottom-full mb-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-20">
                      <button onClick={() => { navigator.clipboard.writeText(paper.arxiv_id); setMoreOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900">
                        <Copy className="w-4 h-4 flex-shrink-0" />Copy arXiv ID
                      </button>
                      <a href={'https://arxiv.org/abs/' + paper.arxiv_id} target="_blank" rel="noopener noreferrer"
                        onClick={() => setMoreOpen(false)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900">
                        <ArrowRight className="w-4 h-4 flex-shrink-0" />Open on arXiv.org
                      </a>
                      <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer"
                        onClick={() => setMoreOpen(false)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900">
                        <FileText className="w-4 h-4 flex-shrink-0" />Download PDF
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

// ── RecCard ── mini card used inside PaperDetailModal ────────────────────────

function RecCard({ paper }: { paper: Paper }) {
  const score = scoreColor(paper.quality_score);
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
      <div className={'flex flex-col items-center justify-center w-12 flex-shrink-0 rounded-lg border py-1.5 ' + score.bg + ' ' + score.border}>
        <div className={'text-[9px] font-semibold uppercase tracking-wider ' + score.text}>AI</div>
        <div className={'text-base font-bold leading-none ' + score.text}>{paper.quality_score != null ? paper.quality_score.toFixed(1) : '—'}</div>
      </div>
      <div className="min-w-0 flex-1">
        <a href={paper.paper_url} target="_blank" rel="noopener noreferrer"
          className="text-sm font-semibold text-slate-900 hover:underline leading-snug line-clamp-2 block">{paper.title}</a>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
          <span>{authorString(paper.authors)}</span>
          <span className="text-slate-300">·</span>
          <span>{formatDate(paper.published_at)}</span>
        </div>
        {paper.summary ? <p className="mt-1 text-[12px] text-slate-600 leading-relaxed line-clamp-2">{paper.summary}</p> : null}
      </div>
    </div>
  );
}

// ── PaperDetailModal ── UC14: chi tiết + recommendation ──────────────────────

function PaperDetailModal({ paper, onClose, onToggleFavorite }: {
  paper: Paper;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
}) {
  const [recs, setRecs] = useState<Paper[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [recsError, setRecsError] = useState(false);
  const score = scoreColor(paper.quality_score);

  // Fetch recommendations — only for DONE papers with embedding
  useEffect(() => {
    if (paper.processing_status !== 'DONE') { setRecsLoading(false); return; }
    setRecsLoading(true); setRecsError(false);
    fetchRecommendations(paper.id)
      .then(data => { setRecs(data); setRecsLoading(false); })
      .catch(() => { setRecsError(true); setRecsLoading(false); });
  }, [paper.id]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start gap-4 p-6 border-b border-slate-200 flex-shrink-0">
          <div className={'flex flex-col items-center justify-center w-12 sm:w-14 flex-shrink-0 rounded-lg border py-2 ' + score.bg + ' ' + score.border}>
            <div className={'text-[10px] font-semibold uppercase tracking-wider ' + score.text}>AI</div>
            <div className={'text-lg sm:text-xl font-bold leading-none ' + score.text}>{paper.quality_score != null ? paper.quality_score.toFixed(1) : '—'}</div>
            <div className={'text-[9px] opacity-70 mt-0.5 ' + score.text}>/ 10</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mb-1.5">
              <span className="font-mono text-slate-600">{paper.arxiv_id}</span>
              <span className="text-slate-300">·</span>
              <span>{formatDate(paper.published_at)}</span>
              <span className="text-slate-300">·</span>
              <span>{timeAgo(paper.published_at)}</span>
            </div>
            <h2 className="text-[17px] font-semibold text-slate-900 leading-snug mb-1.5">{paper.title}</h2>
            <p className="text-xs text-slate-500 mb-2">{paper.authors}</p>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(paper.topics ?? [])].map(t => <Badge key={t} tone="indigo" icon={Tag}>{t}</Badge>)}
            </div>
          </div>
          <button onClick={onClose} title="Close (Esc)"
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Abstract */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Abstract</div>
            <p className="text-sm text-slate-700 leading-relaxed">{paper.abstract}</p>
          </div>

          {/* AI Summary */}
          {paper.summary ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-slate-700" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">AI Summary</span>
                <span className="text-[10px] text-slate-500 ml-1">· llama-3.1-8b-instant</span>
                <span className={'ml-auto inline-flex items-center gap-1 text-[11px] font-medium ' + score.text}>
                  <span className={'w-1.5 h-1.5 rounded-full ' + score.dot} />Quality {paper.quality_score?.toFixed(1)}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{paper.summary}</p>
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={() => onToggleFavorite(paper.id)}
              className={'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ' + (paper.is_favorite ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50')}>
              <Heart className={'w-4 h-4 ' + (paper.is_favorite ? 'fill-rose-500 text-rose-500' : '')} />
              {paper.is_favorite ? 'Saved' : 'Favorite'}
            </button>
            <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
              <FileText className="w-4 h-4" />Read PDF
            </a>
            <a href={paper.paper_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">
              <ArrowRight className="w-4 h-4" />arXiv page
            </a>
          </div>

          {/* Recommendations — UC14 */}
          {paper.processing_status === 'DONE' && (
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-semibold text-slate-900">Similar papers</span>
                <span className="text-xs text-slate-400 ml-1">top‑10 · cosine similarity · cached 1h</span>
              </div>
              {recsLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />Finding similar papers…
                </div>
              ) : recsError ? (
                <p className="text-sm text-slate-400 py-4 text-center">Could not load recommendations.</p>
              ) : recs.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No similar papers found.</p>
              ) : (
                <div className="space-y-2">
                  {recs.map(rec => <RecCard key={rec.id} paper={rec} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ active, onNavigate, topics, topicsLoading, mobileOpen, onClose, navCounts, topicFilter, onTopicClick, onManageTopics }:
  { active: string; onNavigate: (v: string) => void; topics: Topic[]; topicsLoading: boolean; mobileOpen: boolean; onClose: () => void; navCounts: Record<string, number>; topicFilter: string | null; onTopicClick: (n: string | null) => void; onManageTopics: () => void }) {
  const usage = topics.length;
  const pct = Math.min(100, Math.round((usage / TOPIC_LIMIT) * 100));

  const NavItem = ({ icon: Icon, label, value, count }: { icon: React.ElementType; label: string; value: string; count?: number }) => (
    <button onClick={() => onNavigate(value)}
      className={'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ' + (active === value ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')}>
      <span className="flex items-center gap-2.5"><Icon className="w-[18px] h-[18px]" /><span className="font-medium">{label}</span></span>
      {count != null && count > 0 ? (
        <span className={'text-xs px-1.5 py-0.5 rounded-md font-medium ' + (active === value ? 'bg-white/15 text-white' : 'bg-slate-200 text-slate-700')}>{count}</span>
      ) : null}
    </button>
  );

  return (
    <>
      {mobileOpen ? <div className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden" onClick={onClose} /> : null}
      <aside className={'bg-white border-r border-slate-200 flex flex-col w-[260px] flex-shrink-0 z-40 fixed lg:static inset-y-0 left-0 transform transition-transform ' + (mobileOpen ? 'translate-x-0 ' : '-translate-x-full lg:translate-x-0 ')}>
        <div className="h-16 px-5 flex items-center gap-2.5 border-b border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center"><FileSearch className="w-[18px] h-[18px] text-white" strokeWidth={2.2} /></div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-slate-900 tracking-tight">Scholarslate</div>
            <div className="text-[11px] text-slate-500 -mt-0.5">arXiv tracker · v0.4</div>
          </div>
        </div>
        <nav className="px-3 py-4 space-y-1">
          <NavItem icon={LayoutGrid} label="Feed" value="feed" count={navCounts.feed} />
          <NavItem icon={Heart} label="Favorites" value="favorites" count={navCounts.favorites} />
          <NavItem icon={Bell} label="Notifications" value="notifications" count={navCounts.notifications} />
          <NavItem icon={Search} label="Search" value="search" />
          <NavItem icon={TrendingUp} label="Trends" value="trends" />
        </nav>
        <div className="px-3"><div className="border-t border-slate-200" /></div>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">My Topics</div>
          <button onClick={onManageTopics} className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-medium">
            <Settings2 className="w-3.5 h-3.5" />Manage
          </button>
        </div>
        <div className="px-3 space-y-1 overflow-y-auto">
          {topicFilter ? (
            <button onClick={() => onTopicClick(null)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-[12px] text-blue-700 mb-1 hover:bg-blue-100">
              <X className="w-3.5 h-3.5" /><span className="font-medium truncate flex-1 text-left">Clear: {topicFilter}</span>
            </button>
          ) : null}
          {topicsLoading ? <div className="px-3 py-3 text-[12px] text-slate-400">Loading topics…</div>
            : topics.length === 0 ? <div className="px-3 py-3 text-[12px] text-slate-400">No topics yet. Click Manage to add one.</div> : null}
          {topics.map(t => {
            const selected = topicFilter === t.name;
            return (
              <button key={t.id} onClick={() => onTopicClick(selected ? null : t.name)}
                className={'w-full flex items-center justify-between px-3 py-2 rounded-lg group transition-colors ' + (selected ? 'bg-slate-900 text-white' : 'hover:bg-slate-100')}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className={'w-1.5 h-1.5 rounded-full flex-shrink-0 ' + (t.is_active ? (selected ? 'bg-emerald-300' : 'bg-emerald-500') : 'bg-slate-300')} />
                  <span className={'text-sm truncate ' + (selected ? '' : 'text-slate-700')}>{t.name}</span>
                </span>
                <span className={'flex items-center gap-1.5 text-[11px] ' + (selected ? 'text-white/70' : 'text-slate-500')}>{kwCount(t.keywords)} kw</span>
              </button>
            );
          })}
          <button onClick={onManageTopics} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 hover:text-slate-900 hover:border-slate-400 hover:bg-slate-50 transition-colors">
            <Plus className="w-4 h-4" />New topic
          </button>
        </div>
        <div className="mt-auto px-5 pt-4 pb-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
              <span className="font-medium">Topic usage</span>
              <span><span className="text-slate-900 font-semibold">{usage}</span><span className="text-slate-400"> / {TOPIC_LIMIT}</span></span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className={'h-full rounded-full ' + (pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-slate-900')} style={{ width: pct + '%' }} />
            </div>
            <div className="text-[11px] text-slate-500 mt-2">Project cap: {TOPIC_LIMIT} topics · 5 keywords each</div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────

function Topbar({ onMobileMenu, query, onQuery, onSubmitQuery, notifications, onMarkAllRead, onMarkOneRead, onOpenPaper, onNavigate, user, onLogout, onOpenAccount }:
  { onMobileMenu: () => void; query: string; onQuery: (q: string) => void; onSubmitQuery: (q: string) => void; notifications: Notification[]; onMarkAllRead: () => void; onMarkOneRead: (id: string) => void; onOpenPaper: (id: string) => void; onNavigate: (v: string) => void; user: UserType; onLogout: () => void; onOpenAccount: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<'all' | 'unread'>('all');
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const visibleNotifs = notifTab === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); setNotifOpen(false); } };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [menuOpen, notifOpen]);

  const MenuItem = ({ icon: Icon, label, danger = false, onClick }: { icon: React.ElementType; label: string; danger?: boolean; onClick?: () => void }) => (
    <button onClick={() => { setMenuOpen(false); onClick?.(); }}
      className={'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ' + (danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900')}>
      <Icon className="w-4 h-4 flex-shrink-0" /><span className="flex-1 text-left">{label}</span>
    </button>
  );

  return (
    <header className="h-16 bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-20 flex items-center px-4 lg:px-6 gap-3">
      <button onClick={onMobileMenu} className="lg:hidden w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Open menu">
        <Menu className="w-[18px] h-[18px]" />
      </button>
      <form onSubmit={(e) => { e.preventDefault(); onSubmitQuery(query); }} className="flex-1 max-w-2xl relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search papers, authors, arXiv IDs…"
          className="w-full h-10 pl-9 pr-4 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
      </form>
      <div className="flex items-center gap-2 ml-auto">
        {/* Notifications bell */}
        <div className="relative" ref={notifRef}>
          <button onClick={() => { setNotifOpen(o => !o); setMenuOpen(false); }}
            className={'relative inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ' + (notifOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50')}>
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 ? <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-semibold ring-2 ring-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
          </button>
          {notifOpen ? (
            <>
              {/* Mobile backdrop */}
              <div className="fixed inset-0 z-20 sm:hidden" onClick={() => setNotifOpen(false)} />
              {/* Panel:
                  mobile  → fixed, full-width, pinned below header (top-16 = h-16 header)
                  desktop → absolute dropdown anchored right of bell button */}
              <div className={
                'z-30 bg-white border-slate-200 shadow-lg overflow-hidden ' +
                'fixed inset-x-0 top-16 border-b rounded-none ' +
                'sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] sm:border sm:rounded-xl'
              }>
                <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                  <span className="text-sm font-semibold text-slate-900">Notifications</span>
                  <div className="flex items-center gap-3">
                    <button onClick={onMarkAllRead} disabled={unreadCount === 0}
                      className="text-[12px] text-slate-600 hover:text-slate-900 font-medium disabled:text-slate-300 inline-flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5" />Mark all read
                    </button>
                    {/* Close button — mobile only */}
                    <button onClick={() => setNotifOpen(false)} className="sm:hidden w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="px-3 pt-2 pb-1 flex items-center gap-1 border-b border-slate-100">
                  {(['all', 'unread'] as const).map(tab => (
                    <button key={tab} onClick={() => setNotifTab(tab)}
                      className={'px-2.5 py-1 rounded-md text-[12px] font-medium ' + (notifTab === tab ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50')}>
                      {tab === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                    </button>
                  ))}
                </div>
                {/* List: mobile uses more screen height */}
                <div className="max-h-[calc(100vh-200px)] sm:max-h-[380px] overflow-y-auto py-1">
                  {visibleNotifs.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">No notifications.</div>
                    : visibleNotifs.map(n => (
                      <button key={n.id} onClick={() => { if (!n.is_read) onMarkOneRead(n.id); setNotifOpen(false); if (n.paper_id) onOpenPaper(n.paper_id); }}
                        className={'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ' + (!n.is_read ? 'bg-blue-50/40' : '')}>
                        <span className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 inline-flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-indigo-700" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-slate-800 leading-snug line-clamp-2">{n.message}</p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{n.type}</span>
                            <span className="text-slate-300">·</span><span>{timeAgo(n.created_at)}</span>
                          </div>
                        </div>
                        {!n.is_read ? <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-3" /> : null}
                      </button>
                    ))}
                </div>
                <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                  <button onClick={() => { setNotifOpen(false); onNavigate('notifications'); }}
                    className="text-[12px] text-slate-700 font-medium hover:text-slate-900 inline-flex items-center gap-1">
                    View all<ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
        <div className="hidden sm:block w-px h-6 bg-slate-200 mx-1" />
        {/* User menu — compact avatar on mobile, full button on sm+ */}
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(o => !o)}
            className={'flex items-center gap-0 sm:gap-2 pl-1 pr-1 sm:pr-2 py-1 rounded-lg transition-colors ' + (menuOpen ? 'bg-slate-100' : 'hover:bg-slate-50')}>
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white text-xs font-semibold inline-flex items-center justify-center flex-shrink-0">{user.initials}</span>
            <span className="hidden sm:block text-left leading-tight ml-0.5">
              <span className="block text-sm font-medium text-slate-900 max-w-[160px] truncate">{user.email}</span>
              <span className="block text-[11px] text-slate-500">Signed in</span>
            </span>
            <ChevronDown className={'hidden sm:block w-3.5 h-3.5 text-slate-400 transition-transform ' + (menuOpen ? 'rotate-180' : '')} />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-30">
              <div className="px-3 py-2 flex items-center gap-2.5 border-b border-slate-100 mb-1">
                <span className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white text-xs font-semibold inline-flex items-center justify-center flex-shrink-0">{user.initials}</span>
                <div className="leading-tight min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{user.email}</div>
                  <div className="text-[11px] text-slate-500">Signed in</div>
                </div>
              </div>
              <div className="px-1.5 space-y-0.5">
                <MenuItem icon={User} label="Account" onClick={onOpenAccount} />
                {user.role === 'ADMIN' && (
                  <MenuItem icon={ShieldCheck} label="Admin panel" onClick={() => { setMenuOpen(false); window.location.href = '/admin'; }} />
                )}
              </div>
              <div className="my-1.5 border-t border-slate-100" />
              <div className="px-1.5">
                <MenuItem icon={LogOut} label="Sign out" danger onClick={onLogout} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

// ── Feed View ─────────────────────────────────────────────────────────────────

type StatusFilter = 'done' | 'all' | 'pending' | 'failed';
type SortMode = 'recent' | 'score' | 'oldest';
type FeedFilter = 'all' | 'today' | 'high' | 'flagged';

function FeedView({ papers, loading, error, sort, onSort, filter, onFilter, statusFilter, onStatusFilter, todayCount, flaggedCount, highCount, onToggleFavorite, topicFilter, focusPaperId, onFocusConsumed, onRefresh, onOpenDetail }:
  { papers: Paper[]; loading: boolean; error: string | null; sort: SortMode; onSort: (s: SortMode) => void; filter: FeedFilter; onFilter: (f: FeedFilter) => void; statusFilter: StatusFilter; onStatusFilter: (s: StatusFilter) => void; todayCount: number; flaggedCount: number; highCount: number; onToggleFavorite: (id: string) => void; topicFilter: string | null; focusPaperId: string | null; onFocusConsumed: () => void; onRefresh: () => void; onOpenDetail: (paper: Paper) => void }) {
  const tabs: { id: FeedFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All' }, { id: 'today', label: 'Today', count: todayCount },
    { id: 'high', label: 'High score', count: highCount },
    { id: 'flagged', label: 'Flagged', count: flaggedCount },
  ];
  return (
    <>
      <PageHeader title={topicFilter ? `Feed · ${topicFilter}` : 'Feed'}
        subtitle={<>Latest papers matching your active topics · last fetch <span className="text-slate-700 font-medium">today, 06:00 UTC</span></>}
        action={<button onClick={onRefresh} disabled={loading} className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin' : '')} />Refresh</button>}
      />
      {/* Toolbar */}
      <div className="flex flex-col gap-2 mb-5">
        {/* Filter tabs — equal-width buttons, fit all 4 in one row on any screen */}
        <div className="flex items-center gap-0.5 sm:gap-1 p-1 bg-white border border-slate-200 rounded-lg w-full">
          {tabs.map(t => (
            <button key={t.id} onClick={() => onFilter(t.id)}
              className={'flex-1 min-w-0 px-1 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1 sm:gap-1.5 ' + (filter === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900')}>
              <span className="truncate">{t.label}</span>
              {t.count ? <span className={'flex-shrink-0 text-[10px] sm:text-[11px] px-1 sm:px-1.5 rounded ' + (filter === t.id ? 'bg-white/15' : 'bg-slate-100 text-slate-600')}>{t.count}</span> : null}
            </button>
          ))}
        </div>
        {/* Sort & status selects */}
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value as StatusFilter)}
            className="flex-1 min-w-0 h-9 pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 focus:outline-none appearance-none">
            <option value="done">DONE only</option><option value="all">All statuses</option>
            <option value="pending">PENDING</option><option value="failed">FAILED</option>
          </select>
          <select value={sort} onChange={(e) => onSort(e.target.value as SortMode)}
            className="flex-1 min-w-0 h-9 pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 focus:outline-none appearance-none">
            <option value="recent">Most recent</option><option value="score">Highest score</option><option value="oldest">Oldest first</option>
          </select>
          <span className="text-xs text-slate-500 hidden sm:inline whitespace-nowrap"><span className="font-semibold text-slate-900">{papers.length}</span> papers</span>
        </div>
      </div>
      <div className="space-y-4 pb-12">
        {loading ? <Spinner label="Loading papers…" />
          : error ? <ErrorBox message={error} />
          : papers.length === 0 ? <EmptyState icon={Inbox} title="No papers match your filters" body="Try clearing the search or switching to All." />
          : papers.map(p => <PaperCard key={p.id} paper={p} onToggleFavorite={onToggleFavorite} focused={focusPaperId === p.id} onFocusConsumed={onFocusConsumed} onOpenDetail={onOpenDetail} />)}
      </div>
    </>
  );
}

// ── Favorites View ────────────────────────────────────────────────────────────

function FavoritesView({ papers, loading, error, onRemoveFavorite, onOpenDetail }: { papers: Paper[]; loading: boolean; error: string | null; onRemoveFavorite: (id: string) => void; onOpenDetail: (paper: Paper) => void }) {
  return (
    <>
      <PageHeader title="Favorites" subtitle={<>{papers.length} saved paper{papers.length === 1 ? '' : 's'}</>} />
      <div className="space-y-4 pb-12">
        {loading ? <Spinner label="Loading favorites…" />
          : error ? <ErrorBox message={error} />
          : papers.length === 0 ? <EmptyState icon={Heart} title="No favorites yet" body="Tap the heart on any paper in the feed to save it here." />
          : papers.map(p => <PaperCard key={p.id} paper={{ ...p, is_favorite: true }} onToggleFavorite={onRemoveFavorite} onOpenDetail={onOpenDetail} />)}
      </div>
    </>
  );
}

// ── Notifications View ────────────────────────────────────────────────────────

function NotificationsView({ items, loading, error, onMarkAllRead, onMarkOneRead, onOpenPaper }: { items: Notification[]; loading: boolean; error: string | null; onMarkAllRead: () => void; onMarkOneRead: (id: string) => void; onOpenPaper: (id: string) => void }) {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const filtered = tab === 'unread' ? items.filter(n => !n.is_read) : items;
  const unread = items.filter(n => !n.is_read).length;
  return (
    <>
      <PageHeader title="Notifications" subtitle="NEW_PAPER notifications generated by the daily 06:00 scheduler."
        action={<button onClick={onMarkAllRead} disabled={unread === 0} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed"><CheckCheck className="w-3.5 h-3.5" />Mark all read</button>} />
      <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg w-fit mb-5">
        {(['all', 'unread'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={'px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ' + (tab === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900')}>
            {t === 'all' ? 'All' : 'Unread'}
            {t === 'unread' && unread > 0 ? <span className={'text-[11px] px-1.5 rounded ' + (tab === t ? 'bg-white/15' : 'bg-rose-50 text-rose-600')}>{unread}</span> : null}
          </button>
        ))}
      </div>
      {loading ? <Spinner label="Loading notifications…" />
        : error ? <ErrorBox message={error} />
        : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {filtered.length === 0 ? <div className="py-16 text-center text-sm text-slate-400">No notifications.</div>
              : filtered.map(n => (
                <button key={n.id} onClick={() => { if (!n.is_read) onMarkOneRead(n.id); if (n.paper_id) onOpenPaper(n.paper_id); }}
                  className={'w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 ' + (!n.is_read ? 'bg-blue-50/40' : '')}>
                  <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 inline-flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-indigo-700" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 leading-snug">{n.message}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{n.type}</span>
                      <span className="text-slate-300">·</span><span>{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                  {!n.is_read ? <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-3" /> : null}
                </button>
              ))}
          </div>
        )}
    </>
  );
}

// ── Search View ───────────────────────────────────────────────────────────────

function SearchView({ onToggleFavorite, initialQuery, onOpenDetail }: { onToggleFavorite: (id: string) => void; initialQuery?: string; onOpenDetail: (paper: Paper) => void }) {
  const [q, setQ] = useState(initialQuery || '');
  const [results, setResults] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState('');

  const doSearch = async (query: string) => {
    if (!query.trim()) return;
    setLoading(true); setSearched(query);
    try {
      const data = await searchPapers(query);
      setResults(data.map(p => ({ ...p, processing_status: normalizeStatus(p.processing_status) as Paper['processing_status'] })));
    } catch { setResults([]); }
    setLoading(false);
  };

  useEffect(() => { if (initialQuery) doSearch(initialQuery); }, [initialQuery]);

  const suggestions = ['mixture of experts', 'retrieval augmented', 'diffusion', 'distillation'];

  return (
    <>
      <PageHeader title="Search" subtitle="Full-text search across title, abstract, and authors." />
      <form onSubmit={(e) => { e.preventDefault(); doSearch(q); }} className="relative mb-5">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Try "mixture of experts" or an author name'
          className="w-full h-12 pl-10 pr-32 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
        <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">Search</button>
      </form>
      {!searched ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Try searching for</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(s => (
              <button key={s} onClick={() => { setQ(s); doSearch(s); }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-slate-200 bg-slate-50 text-sm text-slate-700 hover:bg-slate-100">
                <Search className="w-3 h-3 text-slate-400" />{s}
              </button>
            ))}
          </div>
        </div>
      ) : loading ? <Spinner label="Searching…" /> : (
        <>
          <div className="text-sm text-slate-500 mb-3">
            <span className="font-semibold text-slate-900">{results.length}</span> result{results.length === 1 ? '' : 's'} for <span className="text-slate-900 font-medium">"{searched}"</span>
          </div>
          <div className="space-y-4 pb-12">
            {results.length === 0 ? <EmptyState icon={SearchX} title="No matches" body={`No papers found for "${searched}".`} />
              : results.map(p => <PaperCard key={p.id} paper={p} onToggleFavorite={onToggleFavorite} onOpenDetail={onOpenDetail} />)}
          </div>
        </>
      )}
    </>
  );
}

// ── Trends View ───────────────────────────────────────────────────────────────

function TrendsView({ onAuthError }: { onAuthError: () => void }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTopics().then(data => {
      if (cancelled) return;
      const list = Array.isArray(data) ? data : [];
      setTopics(list); if (list.length > 0) setSelectedTopicId(list[0].id);
      setTopicsLoading(false);
    }).catch(err => {
      if (cancelled) return;
      if (err?.code === 401) { onAuthError(); return; }
      setTopicsError('Failed to load topics'); setTopicsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedTopicId) return;
    let cancelled = false;
    setTrendLoading(true); setTrendError(null);
    fetchTrend(selectedTopicId).then(data => {
      if (cancelled) return;
      setTrend(Array.isArray(data) ? data : []); setTrendLoading(false);
    }).catch(err => {
      if (cancelled) return;
      if (err?.code === 401) { onAuthError(); return; }
      setTrendError('Failed to load trend data'); setTrendLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedTopicId]);

  const series = useMemo(() => {
    const map = new Map(trend.map(d => [d.month, d.count]));
    const today = new Date();
    let end = today;
    if (trend.length > 0) {
      const latest = trend.map(d => d.month).sort().slice(-1)[0];
      const [yy, mm] = latest.split('-').map(n => parseInt(n, 10));
      end = new Date(yy, mm - 1, 1);
    }
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(end.getFullYear(), end.getMonth() - (11 - i), 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      return { key, label: d.toLocaleString('en-US', { month: 'short' }), count: map.get(key) || 0 };
    });
  }, [trend]);

  const selectedTopic = topics.find(t => t.id === selectedTopicId);
  const topicColor = '#6366f1';
  const max = Math.max(1, ...series.map(s => s.count));
  const total = series.reduce((s, p) => s + p.count, 0);
  const lastCount = series.at(-1)?.count ?? 0;
  const prevCount = series.at(-2)?.count ?? 0;
  const delta = lastCount - prevCount;
  const peak = series.reduce((acc, p) => p.count > acc.count ? p : acc, { count: -1, label: '—' });
  const W = 720, H = 220, P = 28;
  const xStep = series.length > 1 ? (W - P * 2) / (series.length - 1) : 0;
  const yScale = (v: number) => H - P - (v / max) * (H - P * 2);

  return (
    <>
      <PageHeader title="Trends" subtitle="Paper volume by topic over the last 12 months." />
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2"><Tag className="w-4 h-4 text-slate-500" /><span className="text-sm font-medium text-slate-700">Topic</span></div>
        <div className="relative flex-1 max-w-md">
          <select value={selectedTopicId || ''} onChange={(e) => setSelectedTopicId(e.target.value)} disabled={topicsLoading || topics.length === 0}
            className="appearance-none w-full h-10 pl-3 pr-9 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none disabled:opacity-60">
            {topicsLoading ? <option>Loading topics…</option>
              : topics.length === 0 ? <option>No topics yet</option>
              : topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        {selectedTopic?.keywords ? <div className="text-[12px] text-slate-500 truncate"><span className="font-medium text-slate-600">Keywords:</span> {selectedTopic.keywords}</div> : null}
      </div>
      {topicsError ? <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700 mb-4">{topicsError}</div> : null}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Papers (12mo)', value: trendLoading ? '—' : total, sub: 'total tracked' },
          { label: 'This month', value: trendLoading ? '—' : lastCount, sub: (delta > 0 ? '+' : '') + delta + ' vs last', subColor: delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-500' },
          { label: 'Peak month', value: trendLoading ? '—' : peak.label, sub: peak.count >= 0 ? peak.count + ' papers' : '' },
          { label: 'Avg / month', value: trendLoading ? '—' : (total / Math.max(1, series.length)).toFixed(1), sub: 'across 12 months' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{s.value}</div>
            <div className={'text-[11px] ' + (s.subColor ?? 'text-slate-500')}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">{selectedTopic ? selectedTopic.name : 'Papers per month'}</div>
            <div className="text-[12px] text-slate-500">Monthly count · GROUP BY DATE_TRUNC('month', published_at)</div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="w-2 h-2 rounded-full" style={{ background: topicColor }} /><span className="font-medium">Papers</span>
          </div>
        </div>
        {trendLoading ? <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">Loading trend…</div>
          : trendError ? <div className="h-[220px] flex items-center justify-center text-sm text-rose-600">{trendError}</div>
          : !selectedTopicId ? <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">Select a topic to view its trend.</div>
          : (
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px] h-[220px]">
                {[0, 0.25, 0.5, 0.75, 1].map((p, i) => <line key={i} x1={P} x2={W - P} y1={P + (H - P * 2) * p} y2={P + (H - P * 2) * p} stroke="#f1f5f9" strokeWidth={1} />)}
                <text x={P - 6} y={P + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{max}</text>
                <text x={P - 6} y={H - P + 4} textAnchor="end" fontSize="10" fill="#94a3b8">0</text>
                {series.map((m, i) => <text key={m.key} x={P + i * xStep} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{m.label}</text>)}
                {series.length > 1 ? <path d={`M ${P} ${H - P} ${series.map((m, i) => `L ${P + i * xStep} ${yScale(m.count)}`).join(' ')} L ${P + (series.length - 1) * xStep} ${H - P} Z`} fill={topicColor} fillOpacity="0.08" /> : null}
                {series.length > 1 ? <path d={series.map((m, i) => `${i === 0 ? 'M' : 'L'} ${P + i * xStep} ${yScale(m.count)}`).join(' ')} fill="none" stroke={topicColor} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /> : null}
                {series.map((m, i) => (
                  <g key={m.key}>
                    <circle cx={P + i * xStep} cy={yScale(m.count)} r={3.5} fill="white" stroke={topicColor} strokeWidth={2} />
                    {m.count > 0 ? <text x={P + i * xStep} y={yScale(m.count) - 8} textAnchor="middle" fontSize="10" fontWeight="600" fill="#475569">{m.count}</text> : null}
                  </g>
                ))}
              </svg>
            </div>
          )}
      </div>
    </>
  );
}

// ── Topics Manager ────────────────────────────────────────────────────────────

function TopicsManager({ open, onClose, topics, onChange, onAuthError }: { open: boolean; onClose: () => void; topics: Topic[]; onChange: (t: Topic[]) => void; onAuthError: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const atCap = topics.length >= TOPIC_LIMIT;
  const newKwCount = keywords.split(',').map(s => s.trim()).filter(Boolean).length;
  const canCreate = !!name.trim() && !!keywords.trim() && newKwCount <= 5 && !atCap;

  const handleAuth = (err: unknown) => {
    if ((err as { code?: number })?.code === 401) { onAuthError(); return true; }
    return false;
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setBusy('create'); setError(null);
    try {
      const created = await createTopic({ name: name.trim(), keywords: keywords.trim() });
      onChange([...topics, created]);
      setName(''); setKeywords('');
    } catch (err) {
      if (handleAuth(err)) return;
      setError((err as Error).message || 'Failed to create topic');
    } finally { setBusy(null); }
  };

  const toggleActive = async (t: Topic) => {
    setBusy(t.id); setError(null);
    const prev = topics;
    onChange(topics.map(x => x.id === t.id ? { ...x, is_active: !x.is_active } : x));
    try { await updateTopic(t.id, { is_active: !t.is_active }); }
    catch (err) { onChange(prev); if (handleAuth(err)) return; setError('Failed to update topic'); }
    finally { setBusy(null); }
  };

  const removeTopic = async (t: Topic) => {
    if (!confirm(`Delete topic "${t.name}"? This cannot be undone.`)) return;
    setBusy(t.id); setError(null);
    const prev = topics;
    onChange(topics.filter(x => x.id !== t.id));
    try { await deleteTopic(t.id); }
    catch (err) { onChange(prev); if (handleAuth(err)) return; setError('Failed to delete topic'); }
    finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-slate-900 text-white inline-flex items-center justify-center flex-shrink-0"><Tag className="w-[18px] h-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-slate-900">Manage topics</div>
            <div className="text-[12px] text-slate-500"><span className="font-medium text-slate-700">{topics.length}</span> / {TOPIC_LIMIT} topics · 5 keywords each</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={submitCreate} className="px-5 py-4 border-b border-slate-100 bg-slate-50/60">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Add new topic</div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-2 items-start">
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={atCap} placeholder="e.g. Mixture-of-Experts"
                className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100 disabled:text-slate-400" />
              <div>
                <input value={keywords} onChange={(e) => setKeywords(e.target.value)} disabled={atCap} placeholder="kw1, kw2, kw3 (max 5)"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100 disabled:text-slate-400" />
                <div className={'mt-1 text-[11px] ' + (newKwCount > 5 ? 'text-rose-600' : 'text-slate-500')}>{newKwCount} / 5 keywords</div>
              </div>
              <button type="submit" disabled={!canCreate || busy === 'create'}
                className="h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5">
                {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add topic
              </button>
            </div>
            {atCap ? <div className="mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Topic limit reached.</div> : null}
          </form>
          {error ? <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[13px] text-rose-700 flex items-start gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span></div> : null}
          <div className="px-5 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Your topics</div>
            {topics.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">No topics yet. Add one above.</div>
              : (
                <ul className="space-y-2">
                  {topics.map(t => {
                    const isBusy = busy === t.id;
                    return (
                      <li key={t.id} className="border border-slate-200 rounded-xl p-3 flex items-start gap-3">
                        <span className={'w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2 ' + (t.is_active ? 'bg-emerald-500' : 'bg-slate-300')} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900">{t.name}</span>
                            <span className={'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ' + (t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{t.is_active ? 'Active' : 'Paused'}</span>
                            <span className="text-[11px] text-slate-500">{kwCount(t.keywords)} kw</span>
                          </div>
                          {t.keywords ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {t.keywords.split(',').map(s => s.trim()).filter(Boolean).map(kw => (
                                <span key={kw} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700 font-mono">{kw}</span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <button onClick={() => toggleActive(t)} disabled={isBusy} role="switch" aria-checked={t.is_active}
                          className={'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ' + (t.is_active ? 'bg-emerald-500' : 'bg-slate-300')}>
                          <span className={'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ' + (t.is_active ? 'translate-x-4' : 'translate-x-0.5')} />
                        </button>
                        <button onClick={() => removeTopic(t)} disabled={isBusy}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Changes apply on the next ingestion run (06:00 UTC).</span>
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 font-medium">Done</button>
        </div>
      </div>
    </div>
  );
}

// ── AccountModal ──────────────────────────────────────────────────────────────

function AccountModal({ open, onClose, onAuthError }: { open: boolean; onClose: () => void; onAuthError: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'info' | 'password'>('info');
  // password form
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('info'); setCurrent(''); setNext(''); setConfirm(''); setPwError(null); setPwOk(false);
    setLoading(true);
    fetchProfile().then(p => { setProfile(p); setLoading(false); })
      .catch(err => { if (err?.code === 401) onAuthError(); setLoading(false); });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null); setPwOk(false);
    if (next.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    if (next !== confirm) { setPwError('Passwords do not match'); return; }
    setSaving(true);
    try {
      await changePassword(current, next);
      setPwOk(true); setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      if ((err as { code?: number })?.code === 401) { onAuthError(); return; }
      setPwError((err as Error).message || 'Failed to change password');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-slate-900 text-white inline-flex items-center justify-center flex-shrink-0">
            <User className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-slate-900">Account</div>
            <div className="text-[12px] text-slate-500">{profile?.email ?? '…'}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>
        {/* Tabs */}
        <div className="px-5 pt-3 flex items-center gap-1 border-b border-slate-100">
          {([['info', 'Profile', ShieldCheck], ['password', 'Change password', KeyRound]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setTab(id); setPwError(null); setPwOk(false); }}
              className={'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ' + (tab === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900')}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
        {/* Body */}
        <div className="px-5 py-5">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : tab === 'info' ? (
            <dl className="space-y-4">
              {[
                { label: 'Email', value: profile?.email },
                { label: 'Role', value: profile?.role },
                { label: 'Member since', value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—' },
              ].map(row => (
                <div key={row.label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{row.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{row.value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-3">
              {[
                { label: 'Current password', value: current, set: setCurrent, placeholder: 'Enter current password' },
                { label: 'New password', value: next, set: setNext, placeholder: 'Min. 6 characters' },
                { label: 'Confirm new password', value: confirm, set: setConfirm, placeholder: 'Repeat new password' },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{f.label}</label>
                  <input type="password" value={f.value} onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder} required
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
                </div>
              ))}
              {pwError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[13px] text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{pwError}
                </div>
              )}
              {pwOk && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[13px] text-emerald-700 flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 flex-shrink-0" />Password changed successfully!
                </div>
              )}
              <button type="submit" disabled={saving}
                className="w-full h-10 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mobile Bottom Navigation ──────────────────────────────────────────────────

function MobileBottomNav({ active, onNavigate, navCounts }: {
  active: string; onNavigate: (v: string) => void; navCounts: Record<string, number>;
}) {
  const items: { icon: React.ElementType; label: string; value: string; count?: number }[] = [
    { icon: LayoutGrid, label: 'Feed',    value: 'feed',          count: navCounts.feed },
    { icon: Heart,      label: 'Saved',   value: 'favorites',     count: navCounts.favorites },
    { icon: Bell,       label: 'Inbox',   value: 'notifications', count: navCounts.notifications },
    { icon: Search,     label: 'Search',  value: 'search' },
    { icon: TrendingUp, label: 'Trends',  value: 'trends' },
  ];
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-stretch h-14">
        {items.map(item => {
          const isActive = active === item.value;
          return (
            <button key={item.value} onClick={() => onNavigate(item.value)}
              className={'flex-1 flex flex-col items-center justify-center gap-0.5 relative py-1 transition-colors ' + (isActive ? 'text-slate-900' : 'text-slate-400')}>
              {/* Active indicator */}
              {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-slate-900 rounded-b-full" />}
              <div className="relative">
                <item.icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
                {item.count ? (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold inline-flex items-center justify-center leading-none">
                    {item.count > 99 ? '99+' : item.count}
                  </span>
                ) : null}
              </div>
              <span className={'text-[10px] leading-none ' + (isActive ? 'font-semibold' : 'font-medium')}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ── DashboardPage ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();

  // ── Auth guard ──
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<UserType>({ email: 'User', initials: 'U', role: 'USER' });

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { navigate('/login', { replace: true }); return; }
    setUser(getUserFromToken(token));
    setAuthChecked(true);
  }, [navigate]);

  const handleLogout = () => { clearAuth(); navigate('/login', { replace: true }); };
  const handleAuthError = () => { clearAuth(); navigate('/login', { replace: true }); };

  // ── Data state ──
  const [papers, setPapers] = useState<Paper[]>([]);
  const [papersLoading, setPapersLoading] = useState(true);
  const [papersError, setPapersError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Paper[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);
  const [favLoaded, setFavLoaded] = useState(false);
  const [favCount, setFavCount] = useState(0); // badge count — loaded eagerly
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [topicsManagerOpen, setTopicsManagerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [detailPaper, setDetailPaper] = useState<Paper | null>(null);

  // ── UI state ──
  const [active, setActive] = useState('feed');
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('done');
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [focusPaperId, setFocusPaperId] = useState<string | null>(null);

  // ── Fetch on auth ──
  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    fetchPapers().then(data => {
      if (cancelled) return;
      setPapers(data.map(p => ({ ...p, processing_status: normalizeStatus(p.processing_status) as Paper['processing_status'] })));
      setPapersLoading(false);
    }).catch(err => {
      if (cancelled) return;
      if (err?.code === 401) { handleAuthError(); return; }
      setPapersError('Failed to load papers'); setPapersLoading(false);
    });
    return () => { cancelled = true; };
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    fetchTopics().then(data => {
      if (cancelled) return;
      setTopics(Array.isArray(data) ? data : []); setTopicsLoading(false);
    }).catch(err => {
      if (cancelled) return;
      if (err?.code === 401) { handleAuthError(); return; }
      setTopicsLoading(false);
    });
    return () => { cancelled = true; };
  }, [authChecked]);

  // Fetch favorites count eagerly so the sidebar badge is accurate from the start.
  // Full favorites list is still lazy-loaded when user visits the tab.
  useEffect(() => {
    if (!authChecked) return;
    fetchFavorites().then(data => {
      setFavCount(data.length);
    }).catch(() => { /* non-critical — badge just stays 0 */ });
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    fetchNotifications().then(data => {
      if (cancelled) return;
      setNotifications(Array.isArray(data) ? data : []); setNotifLoading(false);
    }).catch(err => {
      if (cancelled) return;
      if (err?.code === 401) { handleAuthError(); return; }
      setNotifError('Failed to load notifications'); setNotifLoading(false);
    });
    return () => { cancelled = true; };
  }, [authChecked]);

  // Lazy load favorites
  useEffect(() => {
    if (active !== 'favorites' || favLoaded || favLoading) return;
    setFavLoading(true); setFavError(null);
    fetchFavorites().then(data => {
      setFavorites(data.map(p => ({ ...p, is_favorite: true, processing_status: normalizeStatus(p.processing_status) as Paper['processing_status'] })));
      setFavLoaded(true); setFavLoading(false);
    }).catch(err => {
      if (err?.code === 401) { handleAuthError(); return; }
      setFavError('Failed to load favorites'); setFavLoading(false);
    });
  }, [active, favLoaded, favLoading]);

  // ── Favorites toggle ──
  // Works from Feed, Search, and Favorites views.
  // We check both `papers` and `favorites` to determine wasFav,
  // because search results manage their own Paper state.
  const toggleFav = async (id: string) => {
    const inFeed = papers.find(p => p.id === id);
    const inFavs = favorites.find(p => p.id === id);
    const wasFav = !!(inFeed?.is_favorite || inFavs);
    // Optimistic update in all lists (including open detail modal)
    setPapers(ps => ps.map(p => p.id === id ? { ...p, is_favorite: !wasFav } : p));
    setDetailPaper(prev => prev?.id === id ? { ...prev, is_favorite: !wasFav } : prev);
    try {
      if (wasFav) {
        await removeFavorite(id);
        setFavorites(fs => fs.filter(p => p.id !== id));
      } else {
        await addFavorite(id);
        const source = inFeed ?? inFavs;
        if (source) setFavorites(fs => fs.some(f => f.id === id) ? fs : [...fs, { ...source, is_favorite: true }]);
      }
    } catch (err) {
      // Rollback optimistic update
      setPapers(ps => ps.map(p => p.id === id ? { ...p, is_favorite: wasFav } : p));
      setDetailPaper(prev => prev?.id === id ? { ...prev, is_favorite: wasFav } : prev);
      if ((err as { code?: number })?.code === 401) handleAuthError();
    }
  };

  const removeFromFavorites = async (id: string) => {
    const prev = favorites;
    setFavorites(fs => fs.filter(p => p.id !== id));
    setPapers(ps => ps.map(p => p.id === id ? { ...p, is_favorite: false } : p));
    try { await removeFavorite(id); }
    catch (err) { setFavorites(prev); setPapers(ps => ps.map(p => p.id === id ? { ...p, is_favorite: true } : p)); if ((err as { code?: number })?.code === 401) handleAuthError(); }
  };

  // ── Notifications ──
  const markAllRead = async () => {
    const prev = notifications;
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })));
    try { await markAllNotificationsRead(); }
    catch (err) { setNotifications(prev); if ((err as { code?: number })?.code === 401) handleAuthError(); }
  };
  const markOneRead = async (id: string) => {
    const prev = notifications;
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, is_read: true } : n));
    try { await markNotificationRead(id); }
    catch (err) { setNotifications(prev); if ((err as { code?: number })?.code === 401) handleAuthError(); }
  };

  // ── Derived ──
  const unreadNotifs = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);
  // "Today" = fetched into our system within the last 24h (created_at), NOT arXiv publish date
  const isToday = (p: Paper) => Date.now() - new Date(p.created_at).getTime() < 24 * 60 * 60 * 1000;

  const filtered = useMemo(() => {
    let list = papers.slice();
    if (statusFilter === 'done') list = list.filter(p => p.processing_status === 'DONE');
    else if (statusFilter === 'pending') list = list.filter(p => p.processing_status === 'PENDING');
    else if (statusFilter === 'failed') list = list.filter(p => p.processing_status === 'FAILED');
    if (topicFilter) list = list.filter(p => p.topics?.includes(topicFilter));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.arxiv_id.includes(q) || authorsLower(p.authors).includes(q) || p.abstract.toLowerCase().includes(q));
    }
    if (filter === 'high') list = list.filter(p => p.quality_score != null && p.quality_score >= 8);
    if (filter === 'flagged') list = list.filter(p => p.is_duplicate || p.processing_status === 'FAILED');
    if (filter === 'today') list = list.filter(isToday);
    if (sort === 'recent') list.sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at));
    if (sort === 'oldest') list.sort((a, b) => +new Date(a.published_at) - +new Date(b.published_at));
    if (sort === 'score') list.sort((a, b) => (b.quality_score ?? -1) - (a.quality_score ?? -1));
    return list;
  }, [papers, query, sort, filter, statusFilter, topicFilter]);

  const tabCounts = useMemo(() => {
    let base = statusFilter === 'done' ? papers.filter(p => p.processing_status === 'DONE') : papers;
    if (topicFilter) base = base.filter(p => p.topics?.includes(topicFilter));
    if (query.trim()) { const q = query.toLowerCase(); base = base.filter(p => p.title.toLowerCase().includes(q) || p.arxiv_id.includes(q) || authorsLower(p.authors).includes(q)); }
    return {
      today: base.filter(isToday).length,
      high: base.filter(p => p.quality_score != null && p.quality_score >= 8).length,
      flagged: papers.filter(p => p.is_duplicate || p.processing_status === 'FAILED').length,
    };
  }, [papers, statusFilter, topicFilter, query]);

  // Keep favCount in sync whenever the full list gets loaded/mutated
  useEffect(() => { if (favLoaded) setFavCount(favorites.length); }, [favorites.length, favLoaded]);

  const navCounts = useMemo(() => ({
    feed: papers.filter(p => p.processing_status === 'DONE').length,
    favorites: favCount,
    notifications: unreadNotifs,
  }), [papers, favCount, unreadNotifs]);

  // ── Reload papers ──
  const reloadPapers = () => {
    setPapersLoading(true); setPapersError(null);
    fetchPapers().then(data => {
      setPapers(data.map(p => ({ ...p, processing_status: normalizeStatus(p.processing_status) as Paper['processing_status'] })));
      setPapersLoading(false);
    }).catch(err => {
      if (err?.code === 401) { handleAuthError(); return; }
      setPapersError('Failed to load papers'); setPapersLoading(false);
    });
  };

  // 'topics' is not a real tab — it opens the manager modal instead
  const navTo = (v: string) => {
    if (v === 'topics') { setTopicsManagerOpen(true); return; }
    setActive(v); setMobileNav(false); if (v !== 'feed') setTopicFilter(null);
  };
  const onTopicClick = (name: string | null) => { setTopicFilter(name); setActive('feed'); setMobileNav(false); };
  const onSubmitQuery = (q: string) => { setSearchQuery(q); setActive('search'); };

  const openPaper = async (paperId: string) => {
    // 1. Navigate to feed and clear all filters immediately
    setQuery(''); setFilter('all'); setStatusFilter('all'); setTopicFilter(null);
    setActive('feed'); setMobileNav(false);
    setNotifications(ns => ns.map(n => n.paper_id === paperId ? { ...n, is_read: true } : n));

    // 2. If paper is not in local state (different page / status), fetch it and inject
    const alreadyLoaded = papers.some(p => p.id === paperId);
    if (!alreadyLoaded) {
      try {
        const fetched = await fetchPaperById(paperId);
        const normalized = { ...fetched, processing_status: fetched.processing_status as Paper['processing_status'] };
        setPapers(prev => prev.some(p => p.id === paperId) ? prev : [normalized, ...prev]);
      } catch {
        // Paper not found or error — still navigate to feed
      }
    }

    // 3. Focus + scroll after React has re-rendered
    setFocusPaperId(null);
    requestAnimationFrame(() => requestAnimationFrame(() => setFocusPaperId(paperId)));
  };

  if (!authChecked) return <div className="h-screen w-screen flex items-center justify-center text-slate-400 text-sm">Authenticating…</div>;

  return (
    <div className="h-screen w-screen flex bg-slate-50 text-slate-900">
      <Sidebar active={active} onNavigate={navTo} topics={topics} topicsLoading={topicsLoading}
        onManageTopics={() => setTopicsManagerOpen(true)} mobileOpen={mobileNav} onClose={() => setMobileNav(false)}
        navCounts={navCounts} topicFilter={topicFilter} onTopicClick={onTopicClick} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMobileMenu={() => setMobileNav(true)} query={query} onQuery={setQuery} onSubmitQuery={onSubmitQuery}
          notifications={notifications} onMarkAllRead={markAllRead} onMarkOneRead={markOneRead}
          onOpenPaper={openPaper} onNavigate={navTo} user={user} onLogout={handleLogout}
          onOpenAccount={() => setAccountOpen(true)} />
        <main className="flex-1 overflow-y-auto feed-scroll">
          <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
            {active === 'feed' && (
              <FeedView papers={filtered} loading={papersLoading} error={papersError}
                sort={sort} onSort={setSort} filter={filter} onFilter={setFilter}
                statusFilter={statusFilter} onStatusFilter={setStatusFilter}
                todayCount={tabCounts.today} flaggedCount={tabCounts.flagged} highCount={tabCounts.high}
                onToggleFavorite={toggleFav} topicFilter={topicFilter}
                focusPaperId={focusPaperId} onFocusConsumed={() => setFocusPaperId(null)}
                onRefresh={reloadPapers} onOpenDetail={setDetailPaper} />
            )}
            {active === 'favorites' && (
              <FavoritesView papers={favorites} loading={favLoading} error={favError} onRemoveFavorite={removeFromFavorites} onOpenDetail={setDetailPaper} />
            )}
            {active === 'notifications' && (
              <NotificationsView items={notifications} loading={notifLoading} error={notifError}
                onMarkAllRead={markAllRead} onMarkOneRead={markOneRead} onOpenPaper={openPaper} />
            )}
            {active === 'search' && (
              <SearchView onToggleFavorite={toggleFav} initialQuery={searchQuery} onOpenDetail={setDetailPaper} />
            )}
            {active === 'trends' && <TrendsView onAuthError={handleAuthError} />}
          </div>
        </main>
      </div>
      <MobileBottomNav active={active} onNavigate={navTo} navCounts={navCounts} />
      <TopicsManager open={topicsManagerOpen} onClose={() => setTopicsManagerOpen(false)}
        topics={topics} onChange={setTopics} onAuthError={handleAuthError} />
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} onAuthError={handleAuthError} />
      {detailPaper && (
        <PaperDetailModal paper={detailPaper} onClose={() => setDetailPaper(null)} onToggleFavorite={toggleFav} />
      )}
    </div>
  );
}
