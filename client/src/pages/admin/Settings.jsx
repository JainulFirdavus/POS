


import { useEffect, useState } from 'react';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { Field, PageHeader } from '../../components/ui';

const THEMES = [
  { value: 'midnight', label: 'Midnight', mode: 'Dark', colors: ['#0f172a', '#1e293b', '#6366f1'] },
  { value: 'forest', label: 'Forest', mode: 'Dark', colors: ['#10241f', '#19372d', '#36a878'] },
  { value: 'ember', label: 'Ember', mode: 'Dark · Orange', colors: ['#1a120c', '#33231a', '#ea580c'] },
  { value: 'pearl', label: 'Pearl', mode: 'Light', colors: ['#f5f4ee', '#ffffff', '#b45309'] },
  { value: 'sky', label: 'Sky', mode: 'Light', colors: ['#eef6f7', '#ffffff', '#087e8b'] },
  { value: 'sunrise', label: 'Sunrise', mode: 'Light · Orange', colors: ['#fdf6ef', '#ffffff', '#ea580c'] },
];

export function ImageUpload({ label, value, onChange }) {
  const toast = useToast();
  const upload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      toast('Choose a PNG, JPEG, GIF, or WEBP image under 1 MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.onerror = () => toast('Could not read this image', 'error');
    reader.readAsDataURL(file);
  };

  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt={`${label} preview`} className="h-14 w-14 rounded-lg border border-white/10 bg-paper object-contain p-1" /> : <div className="grid h-14 w-14 place-items-center rounded-lg border border-dashed border-white/15 text-slate-500"><ImagePlus size={20} /></div>}
        <label className="btn btn-ghost cursor-pointer">
          <ImagePlus size={16} /> Upload image
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={upload} />
        </label>
        {value && <button type="button" title={`Remove ${label.toLowerCase()}`} onClick={() => onChange('')} className="btn btn-danger px-3"><Trash2 size={16} /></button>}
      </div>
    </Field>
  );
}

function ThemeChoices({ label, value, onChange }) {
  return (
    <div className="col-span-2">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {THEMES.map((theme) => (
          <button key={theme.value} type="button" aria-pressed={value === theme.value} onClick={() => onChange(theme.value)} className={`rounded-xl border p-3 text-left transition ${value === theme.value ? 'border-indigo-400 ring-2 ring-indigo-500/30' : 'border-white/10 hover:border-white/25'}`}>
            <div className="mb-2 flex h-9 overflow-hidden rounded-md">
              {theme.colors.map((color) => <span key={color} className="flex-1" style={{ background: color }} />)}
            </div>
            <div className="text-sm font-semibold">{theme.label}</div>
            <div className="text-xs text-slate-400">{theme.mode}{theme.value === 'midnight' ? ' · Current style' : ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  const { settings, setSettings } = useSettings();
  const toast = useToast();
  const [f, setF] = useState(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => setF(settings), [settings]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api('/settings', {
        method: 'PUT',
        body: { storeName: f.storeName, address: f.address, logo: f.logo || '', phone: f.phone, currency: f.currency, taxRate: Number(f.taxRate) || 0, taxLabel: f.taxLabel || 'SST', taxNumber: f.taxNumber || '', receiptFooter: f.receiptFooter, ticker: f.ticker, dashboardTheme: f.dashboardTheme || 'midnight', sellerTheme: f.sellerTheme || 'midnight' },
      });
      setSettings(saved);
      toast('Settings saved', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Store identity, screen themes, tax and customer display" />
      <form onSubmit={save} className="card grid max-w-4xl grid-cols-2 gap-5 p-6">
        <Field label="Store name" className="col-span-2"><input className="input" required maxLength={60} value={f.storeName || ''} onChange={set('storeName')} /></Field>
        <ImageUpload label="Store logo" value={f.logo || ''} onChange={(logo) => setF({ ...f, logo })} />
        <Field label="Address"><input className="input" maxLength={160} value={f.address || ''} onChange={set('address')} /></Field>
        <Field label="Phone"><input className="input" maxLength={30} value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Currency code"><input className="input uppercase" maxLength={3} placeholder="MYR" value={f.currency || ''} onChange={set('currency')} /></Field>
        <Field label="Tax rate (%), 0 if not SST-registered"><input className="input" type="number" step="0.01" min="0" max="100" value={f.taxRate ?? 0} onChange={set('taxRate')} /></Field>
        <Field label="Tax name on receipt"><input className="input" maxLength={20} placeholder="SST" value={f.taxLabel || ''} onChange={set('taxLabel')} /></Field>
        <Field label="SST registration no. (optional)"><input className="input" maxLength={40} value={f.taxNumber || ''} onChange={set('taxNumber')} /></Field>
        <Field label="Receipt footer" className="col-span-2"><input className="input" maxLength={160} value={f.receiptFooter || ''} onChange={set('receiptFooter')} /></Field>
        <Field label="Customer display ticker (scrolling text)" className="col-span-2"><textarea className="input" rows={2} maxLength={400} value={f.ticker || ''} onChange={set('ticker')} /></Field>
        <div className="col-span-2 border-t border-white/10 pt-5">
          <h2 className="mb-1 font-semibold">Dashboard appearance</h2>
          <p className="mb-4 text-sm text-slate-400">Choose the theme for the admin dashboard.</p>
          <ThemeChoices label="Dashboard theme" value={f.dashboardTheme || 'midnight'} onChange={(dashboardTheme) => setF({ ...f, dashboardTheme })} />
        </div>
        <div className="col-span-2 border-t border-white/10 pt-5">
          <h2 className="mb-1 font-semibold">Seller appearance</h2>
          <p className="mb-4 text-sm text-slate-400">Choose the theme for the login, cashier and checkout screens.</p>
          <ThemeChoices label="Seller theme" value={f.sellerTheme || 'midnight'} onChange={(sellerTheme) => setF({ ...f, sellerTheme })} />
        </div>
        <div className="col-span-2 flex justify-end">
          <button className="btn btn-primary" disabled={busy}><Save size={16} /> {busy ? 'Saving...' : 'Save settings'}</button>
        </div>
      </form>
    </>
  );
}
 