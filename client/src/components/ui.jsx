
import { motion } from 'framer-motion';
import AnimatedNumber from './AnimatedNumber';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, format, color = '#6366f1', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 26 }}
      className="card relative overflow-hidden p-5"
    >
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-15" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${color}22`, color }}>
          <Icon size={20} />
        </div>
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-bold">
        <AnimatedNumber value={value} format={format} />
      </div>
    </motion.div>
  );
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-3">
      <span className={`relative flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${checked ? 'justify-end bg-emerald-500' : 'justify-start bg-slate-700'}`}>
        <motion.span layout transition={{ type: 'spring', stiffness: 700, damping: 35 }} className="h-5 w-5 rounded-full bg-paper shadow" />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
}

export function Segmented({ id, value, onChange, options }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-900 p-1 ring-1 ring-white/5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${value === o.value ? 'text-on-accent' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-lg bg-indigo-500" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <Icon size={40} strokeWidth={1.5} />
      <p className="text-sm">{text}</p>
    </div>
  );
}

// Text colour (near-black or white) that stays readable on a given background colour, e.g. a user's avatar colour.
export function onColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#0f172a' : '#fff';
}

export const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#84cc16', '#f97316'];

export function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-full transition active:scale-90 ${value === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
 