import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSearch, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2,
  ArrowRight, Loader2, Check, ShieldCheck, Hash, Sparkles,
} from 'lucide-react';
import { apiLogin, apiRegister } from '../api/client';
import { getStoredToken } from '../utils/auth';

// ── Validation helpers ───────────────────────────────────────────────────────

function validateEmail(v: string): string | null {
  if (!v) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
  return null;
}
function validatePassword(v: string, { min = 8 } = {}): string | null {
  if (!v) return 'Password is required.';
  if (v.length < min) return `Must be at least ${min} characters.`;
  return null;
}
function passwordStrength(v: string) {
  if (!v) return { score: 0, label: '', color: 'bg-slate-200', text: 'text-slate-400' };
  let s = 0;
  if (v.length >= 8) s++;
  if (v.length >= 12) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  const map = [
    { label: 'Too short', color: 'bg-rose-400', text: 'text-rose-600' },
    { label: 'Weak', color: 'bg-rose-400', text: 'text-rose-600' },
    { label: 'Fair', color: 'bg-amber-400', text: 'text-amber-600' },
    { label: 'Good', color: 'bg-lime-500', text: 'text-lime-700' },
    { label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-700' },
    { label: 'Excellent', color: 'bg-emerald-500', text: 'text-emerald-700' },
  ];
  return { score: s, ...map[Math.min(s, 5)] };
}

// ── Field ────────────────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string | null;
  hint?: string;
  rightSlot?: React.ReactNode;
  autoFocus?: boolean;
}

function Field({ id, label, type = 'text', value, onChange, placeholder, autoComplete, error, hint, rightSlot, autoFocus }: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const realType = isPassword ? (show ? 'text' : 'password') : type;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-[13px] font-medium text-slate-700">{label}</label>
        {rightSlot}
      </div>
      <div className="relative">
        {type === 'email' ? <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" /> : null}
        {type === 'password' ? <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" /> : null}
        <input
          id={id}
          type={realType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={
            'w-full h-11 rounded-lg border bg-white text-sm text-slate-900 placeholder-slate-400 transition-colors pl-9 ' +
            (isPassword ? 'pr-10 ' : 'pr-3 ') +
            (error
              ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/15 '
              : 'border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 ') +
            'focus:outline-none'
          }
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label={show ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1.5 text-[12px] text-rose-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

// ── Banner ───────────────────────────────────────────────────────────────────

interface Banner { tone: 'error' | 'success'; message: string; }

function BannerBox({ banner }: { banner: Banner }) {
  return (
    <div className={'rounded-lg border p-3 text-sm flex items-start gap-2 ' + (banner.tone === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800')}>
      {banner.tone === 'error'
        ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <span>{banner.message}</span>
    </div>
  );
}

// ── Sign In form ─────────────────────────────────────────────────────────────

interface SignInProps { onSwitch: () => void; onSubmit: (v: { email: string; password: string; remember: boolean }) => void; loading: boolean; banner: Banner | null; }

function SignInForm({ onSwitch, onSubmit, loading, banner }: SignInProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    const em = validateEmail(email); if (em) e.email = em;
    const pw = validatePassword(password, { min: 1 }); if (pw) e.password = pw;
    return e;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate(); setErrors(e); setTouched(true);
    if (Object.keys(e).length === 0) onSubmit({ email, password, remember });
  };

  const liveErrors = touched ? errors : {};

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Field id="signin-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} placeholder="you@lab.io" error={liveErrors.email} autoFocus />
      <Field
        id="signin-password" label="Password" type="password" autoComplete="current-password"
        value={password} onChange={setPassword} placeholder="••••••••" error={liveErrors.password}
        rightSlot={<button type="button" disabled title="Not in scope for this project" className="text-[12px] text-slate-400 cursor-not-allowed">Forgot password?</button>}
      />
      <div className="flex items-center justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <span className="relative inline-flex">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
              className="peer appearance-none w-4 h-4 rounded border border-slate-300 bg-white checked:bg-slate-900 checked:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-colors" />
            <Check className="w-3 h-3 text-white absolute inset-0 m-auto opacity-0 peer-checked:opacity-100 pointer-events-none" />
          </span>
          Keep me signed in
        </label>
        <span className="text-[11px] text-slate-400">JWT TTL · 24h</span>
      </div>
      {banner && <BannerBox banner={banner} />}
      <button type="submit" disabled={loading}
        className="w-full h-11 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Signing in…</> : <>Sign in<ArrowRight className="w-4 h-4" /></>}
      </button>
      <p className="text-center text-sm text-slate-500">
        New to Scholarslate?{' '}
        <button type="button" onClick={onSwitch} className="text-slate-900 font-medium hover:underline">Create an account</button>
      </p>
    </form>
  );
}

// ── Sign Up form ─────────────────────────────────────────────────────────────

interface SignUpProps { onSwitch: () => void; onSubmit: (v: { email: string; password: string }) => void; loading: boolean; banner: Banner | null; }

function SignUpForm({ onSwitch, onSubmit, loading, banner }: SignUpProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const strength = useMemo(() => passwordStrength(password), [password]);

  const validate = () => {
    const e: Record<string, string> = {};
    const em = validateEmail(email); if (em) e.email = em;
    const pw = validatePassword(password, { min: 8 }); if (pw) e.password = pw;
    if (!confirm) e.confirm = 'Please confirm your password.';
    else if (confirm !== password) e.confirm = 'Passwords do not match.';
    if (!accept) e.accept = 'Please accept the terms to continue.';
    return e;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate(); setErrors(e); setTouched(true);
    if (Object.keys(e).length === 0) onSubmit({ email, password });
  };

  const liveErrors = touched ? errors : {};

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Field id="signup-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} placeholder="you@lab.io" error={liveErrors.email} hint="Used for sign-in and new-paper notifications." autoFocus />
      <div>
        <Field id="signup-password" label="Password" type="password" autoComplete="new-password" value={password} onChange={setPassword} placeholder="At least 8 characters" error={liveErrors.password} />
        <div className="mt-2">
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className={'h-1 flex-1 rounded-full transition-colors ' + (i < strength.score ? strength.color : 'bg-slate-200')} />
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className={'font-medium ' + (password ? strength.text : 'text-slate-400')}>{password ? strength.label : 'Password strength'}</span>
            <span className="text-slate-400">BCrypt · never stored as plaintext</span>
          </div>
        </div>
      </div>
      <Field id="signup-confirm" label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" error={liveErrors.confirm} />
      <label className="flex items-start gap-2.5 text-sm text-slate-600 cursor-pointer select-none">
        <span className="relative inline-flex mt-0.5">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)}
            className="peer appearance-none w-4 h-4 rounded border border-slate-300 bg-white checked:bg-slate-900 checked:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-colors" />
          <Check className="w-3 h-3 text-white absolute inset-0 m-auto opacity-0 peer-checked:opacity-100 pointer-events-none" />
        </span>
        <span className="leading-relaxed">I agree to the <a className="text-slate-900 underline underline-offset-2 hover:no-underline" href="#">Terms</a> and <a className="text-slate-900 underline underline-offset-2 hover:no-underline" href="#">Privacy Policy</a>.</span>
      </label>
      {liveErrors.accept && <p className="-mt-2 text-[12px] text-rose-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{liveErrors.accept}</p>}
      {banner && <BannerBox banner={banner} />}
      <button type="submit" disabled={loading}
        className="w-full h-11 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Creating account…</> : <>Create account<ArrowRight className="w-4 h-4" /></>}
      </button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <button type="button" onClick={onSwitch} className="text-slate-900 font-medium hover:underline">Sign in</button>
      </p>
    </form>
  );
}

// ── Right pane ───────────────────────────────────────────────────────────────

function Showcase() {
  const stats = [
    { label: 'Tracking', value: '7', sub: 'topics' },
    { label: 'New today', value: '12', sub: 'papers' },
    { label: 'High score', value: '3', sub: '≥ 8.0' },
  ];
  return (
    <div className="hidden lg:flex flex-col w-1/2 relative bg-slate-900 text-slate-100 overflow-hidden">
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(rgba(15,23,42,0.07) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
      <div className="absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full" style={{ background: 'radial-gradient(closest-side,rgba(99,102,241,0.35),transparent)' }} />
      <div className="absolute bottom-0 -left-20 w-[360px] h-[360px] rounded-full" style={{ background: 'radial-gradient(closest-side,rgba(16,185,129,0.18),transparent)' }} />
      <div className="relative z-10 flex flex-col h-full p-12">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center backdrop-blur">
            <FileSearch className="w-[20px] h-[20px] text-white" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Scholarslate</div>
            <div className="text-[11px] text-slate-400 -mt-0.5">arXiv tracker · v0.4</div>
          </div>
        </div>
        <div className="mt-16 max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight leading-tight text-pretty">The new arXiv firehose,<br />filtered to what you care about.</h2>
          <p className="mt-4 text-[15px] text-slate-300 leading-relaxed">Theo dõi tối đa 10 chủ đề nghiên cứu. Mỗi sáng lúc 06:00, hệ thống tự động lấy paper mới, sinh tóm tắt AI kèm điểm chất lượng, và đánh dấu paper trùng lặp — để bạn chỉ đọc đúng những gì thực sự mới.</p>
        </div>
        <div className="mt-10" style={{ animation: 'floatY 6s ease-in-out infinite' }}>
          <div className="rounded-xl bg-white/5 ring-1 ring-white/10 backdrop-blur p-4 max-w-sm">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Hash className="w-3 h-3" /><span className="font-mono">2604.01829</span>
              <span className="text-slate-500">·</span><span>2h ago</span>
              <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />9.1
              </span>
            </div>
            <div className="mt-2 text-[14px] font-medium leading-snug text-white">Sparse Mixture-of-Experts with Routing-Aware Distillation for Long-Context Reasoning</div>
            <div className="mt-3 rounded-md bg-white/5 ring-1 ring-white/10 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3 h-3 text-indigo-300" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">AI Summary</span>
              </div>
              <p className="text-[12px] text-slate-300 leading-relaxed">RA-MoE pairs expert routing with attention-trace distillation. Activates ~18% of params per token, cuts inference FLOPs 4.3×.</p>
            </div>
          </div>
        </div>
        <div className="mt-auto grid grid-cols-3 gap-4 max-w-md pt-8 border-t border-white/10">
          {stats.map(s => (
            <div key={s.label}>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{s.value}</div>
              <div className="text-[11px] text-slate-400">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── AuthPage ─────────────────────────────────────────────────────────────────

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  // If already logged in, go straight to dashboard
  useEffect(() => {
    if (getStoredToken()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const handleSignIn = async ({ email, password, remember }: { email: string; password: string; remember: boolean }) => {
    setLoading(true); setBanner(null);
    try {
      const { token } = await apiLogin(email, password);
      const store = remember ? localStorage : sessionStorage;
      const other = remember ? sessionStorage : localStorage;
      other.removeItem('token');
      store.setItem('token', token);
      setBanner({ tone: 'success', message: 'Welcome back. Redirecting to your feed…' });
      setTimeout(() => navigate('/dashboard'), 600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error. Please try again.';
      setBanner({ tone: 'error', message: msg });
      setLoading(false);
    }
  };

  const handleSignUp = async ({ email, password }: { email: string; password: string }) => {
    setLoading(true); setBanner(null);
    try {
      const { token } = await apiRegister(email, password);
      localStorage.setItem('token', token);
      setBanner({ tone: 'success', message: 'Account created. Signing you in…' });
      setTimeout(() => navigate('/dashboard'), 600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error. Please try again.';
      setBanner({ tone: 'error', message: msg });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex bg-slate-50 text-slate-900">
      <style>{`@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`}</style>
      {/* Left — auth form */}
      <div className="w-full lg:w-1/2 flex flex-col">
        <div className="lg:hidden h-16 px-5 flex items-center gap-2.5 border-b border-slate-200 bg-white">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
            <FileSearch className="w-[18px] h-[18px] text-white" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-slate-900 tracking-tight">Scholarslate</div>
            <div className="text-[11px] text-slate-500 -mt-0.5">arXiv tracker · v0.4</div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-5 py-10 lg:py-16">
          <div className="w-full max-w-[400px]">
            <div className="inline-flex p-1 bg-white border border-slate-200 rounded-lg mb-7">
              <button onClick={() => { setMode('signin'); setBanner(null); }}
                className={'px-4 h-8 rounded-md text-sm font-medium transition-colors ' + (mode === 'signin' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900')}>
                Sign in
              </button>
              <button onClick={() => { setMode('signup'); setBanner(null); }}
                className={'px-4 h-8 rounded-md text-sm font-medium transition-colors ' + (mode === 'signup' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900')}>
                Create account
              </button>
            </div>
            <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 leading-tight">
              {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {mode === 'signin' ? 'Sign in to continue tracking your topics.' : 'Start tracking arXiv papers across up to 10 topics.'}
            </p>
            <div className="mt-7">
              {mode === 'signin'
                ? <SignInForm onSwitch={() => { setMode('signup'); setBanner(null); }} onSubmit={handleSignIn} loading={loading} banner={banner} />
                : <SignUpForm onSwitch={() => { setMode('signin'); setBanner(null); }} onSubmit={handleSignUp} loading={loading} banner={banner} />
              }
            </div>
            <div className="mt-10 pt-5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
              <span>© 2026 Scholarslate</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" />JWT · BCrypt · TLS</span>
            </div>
          </div>
        </div>
      </div>
      <Showcase />
    </div>
  );
}
