import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Banknote, CheckCircle2, CreditCard, Delete, QrCode } from 'lucide-react';
import Modal from './Modal';
import AnimatedNumber from './AnimatedNumber';
import { useSettings } from '../context/SettingsContext';
import { getSocket } from '../lib/socket';

export const METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote, color: '#10b981' },
  { id: 'card', label: 'Card', icon: CreditCard, color: '#6366f1' },
  { id: 'upi', label: 'UPI / QR', icon: QrCode, color: '#f59e0b' },
];
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del'];
const CUSTOMER_PROMPT = { card: 'Please insert or tap your card', upi: 'Please scan the QR code to pay' };

export default function PaymentModal({ open, onClose, total, initialMethod = 'cash', onComplete }) {
  const { money, settings } = useSettings();
  const methods = METHODS.filter((item) => (settings.paymentMethods ?? { cash: true, card: true, upi: true })[item.id]);
  const [method, setMethod] = useState(initialMethod);
  const [tendered, setTendered] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMethod(methods.some((item) => item.id === initialMethod) ? initialMethod : methods[0]?.id || 'cash');
    setTendered('');
    setBusy(false);
  }, [open, initialMethod, settings.paymentMethods]);

  useEffect(() => {
    if (open && CUSTOMER_PROMPT[method]) getSocket().emit('display:message', { text: CUSTOMER_PROMPT[method], duration: 15000 });
  }, [open, method]);

  const paid = method === 'cash' ? Number(tendered || 0) : total;
  const change = Math.max(0, paid - total);
  const canPay = !busy && (method !== 'cash' || paid >= total - 0.001);

  const quick = useMemo(
    () => [...new Set([total, ...[10, 50, 100, 500, 2000].map((n) => Math.ceil(total / n) * n)])].filter((v) => v > 0).slice(0, 5),
    [total],
  );

  const press = (k) =>
    setTendered((t) => {
      if (k === 'del') return t.slice(0, -1);
      if (k === '.' && t.includes('.')) return t;
      if (t.includes('.') && t.split('.')[1].length >= 2) return t;
      if (t.length >= 9) return t;
      return t === '0' && k !== '.' ? k : t + k;
    });

  const submit = async () => {
    if (!canPay) return;
    setBusy(true);
    await onComplete(method, method === 'cash' ? paid : total);
    setBusy(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (method === 'cash' && /^[\d.]$/.test(e.key)) press(e.key);
      else if (method === 'cash' && e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="Take Payment" width="max-w-3xl">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`relative flex flex-col items-center gap-1.5 rounded-xl py-3 text-sm font-semibold transition-colors ${method === m.id ? 'text-white' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}
              >
                {method === m.id && (
                  <motion.span layoutId="pay-method" className="absolute inset-0 rounded-xl" style={{ background: m.color }} transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
                )}
                <m.icon size={22} className="relative" />
                <span className="relative">{m.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3 rounded-2xl bg-slate-950 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-slate-400">Amount due</span>
              <span className="text-3xl font-black">{money(total)}</span>
            </div>
            {method === 'cash' && (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-400">Tendered</span>
                  <span className="text-2xl font-bold tabular-nums">{tendered ? money(Number(tendered)) : '—'}</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-white/5 pt-3">
                  <span className="text-slate-400">Change</span>
                  <AnimatedNumber value={change} format={money} className={`text-2xl font-bold ${change > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
                </div>
              </>
            )}
          </div>

          <AnimatePresence mode="wait">
            {method === 'cash' ? (
              <motion.div key="quick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex flex-wrap gap-2">
                {quick.map((v, i) => (
                  <button key={v} onClick={() => setTendered(String(v))} className="btn btn-ghost">
                    {i === 0 ? 'Exact' : money(v)}
                  </button>
                ))}
              </motion.div>
            ) : (
              <motion.div key="wait" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex items-center gap-3 rounded-xl bg-slate-800/50 p-4 text-sm text-slate-300">
                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
                  {method === 'card' ? <CreditCard className="text-indigo-400" /> : <QrCode className="text-amber-400" />}
                </motion.div>
                Waiting for customer: "{CUSTOMER_PROMPT[method]}" is shown on the customer screen.
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col">
          <div className={`grid flex-1 grid-cols-3 gap-2 transition-opacity ${method === 'cash' ? '' : 'pointer-events-none opacity-30'}`}>
            {KEYS.map((k) => (
              <button key={k} onClick={() => press(k)} className="grid h-14 place-items-center rounded-xl bg-slate-800 text-xl font-semibold transition duration-100 hover:bg-slate-700 active:scale-90">
                {k === 'del' ? <Delete size={20} /> : k}
              </button>
            ))}
          </div>
          <button onClick={submit} disabled={!canPay} className="btn btn-success mt-4 h-16 text-lg">
            <CheckCircle2 size={22} />
            {busy ? 'Processing...' : `Complete Sale · ${money(paid || total)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
 