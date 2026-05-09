import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, RefreshCw, RotateCcw, Play, ChevronLeft, ChevronRight,
  ShieldCheck, Loader2, CheckCheck, AlertCircle, ArrowLeft,
} from 'lucide-react';
import {
  fetchFailedPapers, resetFailedPaper, resetAllFailedPapers,
  triggerPipeline, triggerRetry,
} from '../api/client';
import { getStoredToken, getUserFromToken } from '../utils/auth';
import { timeAgo, formatDate } from '../utils/format';
import type { Paper, PagedResponse } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ' + (ok ? 'bg-emerald-900 text-white' : 'bg-rose-900 text-white')}>
      {ok ? <CheckCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
    </div>
  );
}

// ── AdminPage ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PagedResponse<Paper> | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);  // paperId being reset
  const [busy, setBusy] = useState<string | null>(null);            // global action in flight
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Auth guard: ADMIN only ──
  useEffect(() => {
    const token = getStoredToken();
    if (!token) { navigate('/login', { replace: true }); return; }
    const user = getUserFromToken(token);
    if (user?.role !== 'ADMIN') { navigate('/dashboard', { replace: true }); }
  }, [navigate]);

  // ── Toast auto-dismiss ──
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Load FAILED papers ──
  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetchFailedPapers(p, 15);
      setData(res);
    } catch {
      setToast({ msg: 'Failed to load papers', ok: false });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  // ── Actions ──
  const handleReset = async (id: string) => {
    setResetting(id);
    try {
      await resetFailedPaper(id);
      setToast({ msg: 'Paper reset — RetryScheduler will pick it up within 30 min', ok: true });
      load(page);
    } catch {
      setToast({ msg: 'Reset failed', ok: false });
    }
    setResetting(null);
  };

  const handleResetAll = async () => {
    if (!confirm('Reset ALL failed papers to retry? This cannot be undone.')) return;
    setBusy('reset-all');
    try {
      await resetAllFailedPapers();
      setToast({ msg: 'All FAILED papers reset — call Retry to reprocess', ok: true });
      load(page);
    } catch {
      setToast({ msg: 'Reset all failed', ok: false });
    }
    setBusy(null);
  };

  const handleTriggerPipeline = async () => {
    setBusy('pipeline');
    try {
      await triggerPipeline();
      setToast({ msg: 'Main pipeline triggered — running in background', ok: true });
    } catch {
      setToast({ msg: 'Could not trigger pipeline', ok: false });
    }
    setBusy(null);
  };

  const handleTriggerRetry = async () => {
    setBusy('retry');
    try {
      await triggerRetry();
      setToast({ msg: 'Retry scheduler triggered — processing FAILED papers', ok: true });
    } catch {
      setToast({ msg: 'Could not trigger retry', ok: false });
    }
    setBusy(null);
  };

  const totalFailed = data?.totalElements ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Topbar ── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium">
          <ArrowLeft className="w-4 h-4" />Dashboard
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-slate-700" />
          <span className="font-semibold text-slate-900 text-[15px]">Admin panel</span>
          <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">ADMIN</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Refresh list */}
          <button onClick={() => load(page)} disabled={loading}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />Refresh
          </button>
          {/* Trigger main pipeline */}
          <button onClick={handleTriggerPipeline} disabled={busy === 'pipeline'}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 disabled:opacity-40">
            {busy === 'pipeline' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run pipeline
          </button>
          {/* Trigger retry */}
          <button onClick={handleTriggerRetry} disabled={busy === 'retry'}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-40">
            {busy === 'retry' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Run retry
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">FAILED papers</div>
            <div className="text-3xl font-bold text-rose-600">{totalFailed}</div>
            <div className="text-xs text-slate-500 mt-1">retry_count &lt; 3 · eligible for retry</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Retry limit</div>
            <div className="text-3xl font-bold text-slate-800">3</div>
            <div className="text-xs text-slate-500 mt-1">max attempts per paper</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Retry interval</div>
            <div className="text-3xl font-bold text-slate-800">30 min</div>
            <div className="text-xs text-slate-500 mt-1">fixedDelay scheduler</div>
          </div>
        </div>

        {/* ── Table header ── */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            FAILED papers
          </h2>
          {totalFailed > 0 && (
            <button onClick={handleResetAll} disabled={busy === 'reset-all' || loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm font-medium hover:bg-rose-100 disabled:opacity-40">
              {busy === 'reset-all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Reset all
            </button>
          )}
        </div>

        {/* ── Table ── */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? <Spinner /> : !data || data.content.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 inline-flex items-center justify-center mb-3">
                <CheckCheck className="w-6 h-6 text-emerald-500" />
              </div>
              <div className="text-sm font-medium text-slate-700">No FAILED papers</div>
              <div className="text-xs text-slate-400 mt-1">All papers processed successfully.</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-[130px]">arXiv ID</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Title</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-[90px]">Retries</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-[120px]">Last retry</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Last error</th>
                  <th className="px-4 py-3 w-[90px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.content.map(paper => (
                  <tr key={paper.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <a href={'https://arxiv.org/abs/' + paper.arxiv_id} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-xs text-indigo-600 hover:underline">{paper.arxiv_id}</a>
                      <div className="text-[11px] text-slate-400 mt-0.5">{formatDate(paper.published_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug">{paper.title}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={'inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ' + (paper.retry_count >= 3 ? 'bg-rose-100 text-rose-700' : paper.retry_count >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>
                        {paper.retry_count}
                      </span>
                      <span className="text-[11px] text-slate-400 ml-1">/ 3</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-500">
                      {paper.last_retry_at ? timeAgo(paper.last_retry_at) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      {paper.last_error ? (
                        <div className="text-[11px] text-rose-600 leading-snug line-clamp-2 bg-rose-50 rounded px-2 py-1 font-mono">
                          {paper.last_error}
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleReset(paper.id)} disabled={resetting === paper.id}
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 text-[12px] text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-medium">
                        {resetting === paper.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
            <span>Page {page + 1} of {data.totalPages} · {data.totalElements} total</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />Prev
              </button>
              <button onClick={() => setPage(p => Math.min(data.totalPages - 1, p + 1))} disabled={page >= data.totalPages - 1}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40">
                Next<ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Info box ── */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 space-y-2">
          <div className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Pipeline info</div>
          <div><span className="font-medium text-slate-700">Run pipeline</span> — fetch arXiv papers → embedding → duplicate check → Groq summary. Runs async in virtual thread, check server logs for progress.</div>
          <div><span className="font-medium text-slate-700">Run retry</span> — immediately reprocess all FAILED papers with retry_count &lt; 3. Useful after fixing an API key or endpoint issue.</div>
          <div><span className="font-medium text-slate-700">Reset</span> — sets paper back to PENDING with retry_count=0. The RetryScheduler picks it up within 30 minutes.</div>
          <div><span className="font-medium text-slate-700">Reset all</span> — same as Reset but for every FAILED paper. Follow with "Run retry" to reprocess immediately.</div>
        </div>
      </main>

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
