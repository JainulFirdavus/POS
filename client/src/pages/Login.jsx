

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { Navigate } from 'react-router-dom';
import { ArrowLeft, Check, Delete, Eye, EyeOff, Lock, Monitor, ShieldCheck, ShoppingCart, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { onColor } from '../components/ui';
import { api } from '../lib/api';
import Clock from '../components/Clock';

const SHAKE = { x: [0, -14, 14, -10, 10, -4, 0], transition: { duration: 0.45 } };

function Background() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] animate-blob rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--color-indigo-500)_35%,transparent),transparent_65%)]" />
      <div className="absolute -bottom-48 -right-40 h-[40rem] w-[40rem] animate-blob rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.28),transparent_65%)] [animation-delay:-6s]" />
      <div className="absolute left-1/3 top-1/2 h-[28rem] w-[28rem] animate-blob rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.2),transparent_65%)] [animation-delay:-12s]" />
      <div className="absolute inset-0 bg-[linear-gradient(color-mix(in_oklab,var(--color-white)_4%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--color-white)_4%,transparent)_1px,transparent_1px)] bg-[size:48px_48px]" />
    </div>
  );
}

function SellerLogin() {
  const { login } = useAuth();
  const [sellers, setSellers] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const controls = useAnimationControls();

  useEffect(() => {
    api('/auth/sellers').then(setSellers).catch(() => setSellers([]));
  }, []);

  const submit = useCallback(async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    setError('');
    try {
      await login({ mode: 'seller', userId: selected._id, secret: pin });
    } catch (e) {
      setError(e.message);
      setPin('');
      controls.start(SHAKE);
      setBusy(false);
    }
  }, [pin, busy, login, selected, controls]);

  const press = useCallback(
    (k) => {
      setError('');
      if (k === 'del') setPin((p) => p.slice(0, -1));
      else if (k === 'ok') submit();
      else setPin((p) => (p.length < 6 ? p + k : p));
    },
    [submit],
  );

  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') press('ok');
      else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, press]);

  return (
    <motion.div key="seller" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.25 }}>
      <AnimatePresence mode="wait">
        {!selected ? (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
            <p className="mb-4 text-sm text-slate-400">Select your profile to start selling</p>
            <div className="grid grid-cols-2 gap-3">
              {sellers?.map((s, i) => (
                <motion.button
                  key={s._id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setSelected(s);
                    setPin('');
                    setError('');
                  }}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-white/5 bg-slate-800/50 p-5 transition-colors hover:border-white/20 hover:bg-slate-800"
                >
                  <div className="grid h-14 w-14 place-items-center rounded-full text-xl font-bold shadow-lg" style={{ background: s.color, color: onColor(s.color) }}>
                    {s.name[0]?.toUpperCase()}
                  </div>
                  <span className="font-semibold">{s.name}</span>
                </motion.button>
              ))}
            </div>
            {sellers && !sellers.length && <p className="py-8 text-center text-sm text-slate-500">No sellers yet. Ask an admin to create one.</p>}
            {!sellers && <div className="py-10 text-center text-sm text-slate-500">Loading...</div>}
          </motion.div>
        ) : (
          <motion.div key="pin" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <button onClick={() => setSelected(null)} className="mb-4 flex items-center gap-1 text-sm text-slate-400 hover:text-white">
              <ArrowLeft size={16} /> Change user
            </button>
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full text-lg font-bold" style={{ background: selected.color, color: onColor(selected.color) }}>
                {selected.name[0]?.toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{selected.name}</div>
                <div className="text-xs text-slate-400">Enter your PIN</div>
              </div>
            </div>
            <motion.div animate={controls} className="mb-2 flex justify-center gap-3">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <motion.span
                  key={i}
                  animate={{ scale: i < pin.length ? 1.15 : 1, backgroundColor: i < pin.length ? '#10b981' : 'rgba(255,255,255,0.08)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 25 }}
                  className="h-4 w-4 rounded-full"
                />
              ))}
            </motion.div>
            <div className="mb-3 h-5 text-center text-sm text-rose-400">{error}</div>
            <div className="grid grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  disabled={busy}
                  className={`grid h-14 place-items-center rounded-xl text-xl font-semibold transition duration-100 active:scale-90 ${
                    k === 'ok' ? 'bg-emerald-600 text-on-accent hover:bg-emerald-700' : k === 'del' ? 'bg-white/5 text-slate-300 hover:bg-white/10' : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  {k === 'del' ? <Delete size={20} /> : k === 'ok' ? <Check size={22} /> : k}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AdminLogin() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const controls = useAnimationControls();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login({ mode: 'admin', username, secret: password });
    } catch (err) {
      setError(err.message);
      controls.start(SHAKE);
      setBusy(false);
    }
  };

  return (
    <motion.form
      key="admin"
      onSubmit={submit}
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <p className="text-sm text-slate-400">Sign in to manage products, stock, reports and staff.</p>
      <motion.div animate={controls} className="space-y-4">
        <div className="relative">
          <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input h-12 pl-11" placeholder="Username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </div>
        <div className="relative">
          <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input h-12 pl-11 pr-11"
            placeholder="Password"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </motion.div>
      <div className="h-5 text-sm text-rose-400">{error}</div>
      <button className="btn btn-primary h-12 w-full text-base" disabled={busy}>
        {busy ? 'Signing in...' : 'Sign in to Admin'}
      </button>
    </motion.form>
  );
}

const TABS = [
  { id: 'seller', label: 'Seller', icon: ShoppingCart, color: 'bg-emerald-600' },
  { id: 'admin', label: 'Admin', icon: ShieldCheck, color: 'bg-indigo-500' },
];

export default function Login() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [mode, setMode] = useState('seller');

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/pos'} replace />;

  return (
    <motion.div data-theme={settings.sellerTheme || 'midnight'} className="pos-themed relative flex h-full items-center justify-center overflow-hidden p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Background />
      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="hidden md:block">
          <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-3xl shadow-2xl shadow-indigo-500/30">🛒</div>
          <h1 className="text-5xl font-black leading-tight tracking-tight">
            {settings.storeName}
            <span className="block bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">Point of Sale</span>
          </h1>
          <p className="mt-4 max-w-sm text-slate-400">Fast checkout, live customer display, stock tracking and one-click daily & monthly exports.</p>
          <Clock big className="mt-8" />
          <button
            onClick={() => window.open('#/customer', 'customer-display', 'popup,noopener,width=1280,height=720')}
            className="btn btn-ghost mt-6"
          >
            <Monitor size={16} /> Open customer display
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 24 }}
          className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/85 p-7 shadow-2xl"
        >
          <div className="mb-6 grid grid-cols-2 rounded-2xl bg-slate-950/70 p-1.5">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setMode(t.id)} className={`relative flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${mode === t.id ? 'text-on-accent' : 'text-slate-400 hover:text-slate-200'}`}>
                {mode === t.id && <motion.span layoutId="login-tab" className={`absolute inset-0 rounded-xl ${t.color}`} transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
                <t.icon size={16} className="relative" />
                <span className="relative">{t.label} Login</span>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {mode === 'seller' ? <SellerLogin key="seller" /> : <AdminLogin key="admin" />}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
} 