import { useEffect, useState } from 'react';
import { LayoutGrid, LayoutList, PanelBottom, PanelLeft, PanelTop, Save } from 'lucide-react';
import { PageHeader, Toggle } from '../../components/ui';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { LAYOUT_DEFAULTS } from '../POS';

function Choice({ label, hint, value, onChange, options }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div>
        <div className="font-semibold">{label}</div>
        {hint && <div className="text-sm text-slate-400">{hint}</div>}
      </div>
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-950/60 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${value === o.value ? 'bg-indigo-500 text-on-accent' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          >
            {o.icon && <o.icon size={16} />} {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// A small schematic of the POS screen so the effect of each option is visible before saving.
function Preview({ l }) {
  const menu = { sm: 10, md: 14, lg: 20 }[l.menuSize];
  const cart = { sm: 26, md: 30, lg: 36 }[l.cartWidth];
  const tile = { sm: 9, md: 12, lg: 16, xl: 21 }[l.tileSize];
  const rowH = { sm: 5, md: 7, lg: 9, xl: 11 }[l.tileSize];
  const bar = <div className="flex shrink-0 gap-1 bg-slate-800 p-1" style={{ height: `${menu}%` }}>{Array.from({ length: 6 }, (_, i) => <div key={i} className={`w-8 rounded ${i === 0 ? 'bg-indigo-500' : 'bg-slate-700'}`} />)}</div>;
  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-slate-950 text-[0px]">
      <div className="h-[8%] bg-slate-800/70" />
      <div className="flex h-[92%]">
        {l.menuPosition === 'left' && <div className="flex shrink-0 flex-col gap-1 bg-slate-800 p-1" style={{ width: `${menu * 0.7}%` }}>{Array.from({ length: 6 }, (_, i) => <div key={i} className={`h-6 rounded ${i === 0 ? 'bg-indigo-500' : 'bg-slate-700'}`} />)}</div>}
        <div className="flex min-w-0 flex-1 flex-col">
          {l.menuPosition === 'top' && bar}
          <div className="min-h-0 flex-1 overflow-hidden p-1.5">
            {l.view === 'grid' ? (
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tile}%, 1fr))` }}>
                {Array.from({ length: 40 }, (_, i) => <div key={i} className="aspect-square rounded bg-slate-800" />)}
              </div>
            ) : (
              <div className="space-y-0.5">{Array.from({ length: 24 }, (_, i) => <div key={i} className="rounded-sm bg-slate-800" style={{ height: rowH }} />)}</div>
            )}
          </div>
          {l.menuPosition === 'bottom' && bar}
        </div>
        <div className="shrink-0 border-l border-white/10 bg-slate-900 p-1.5" style={{ width: `${cart}%` }}>
          <div className="mb-1 h-3 rounded bg-slate-700" />
          <div className="mb-3 flex gap-1"><div className="h-3 flex-1 rounded bg-indigo-500" /><div className="h-3 flex-1 rounded bg-slate-700" /></div>
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="mb-1 h-4 rounded bg-slate-800" />)}
          <div className="mt-6 h-6 rounded bg-emerald-600" />
        </div>
      </div>
    </div>
  );
}

export default function PosLayout() {
  const { settings, setSettings } = useSettings();
  const toast = useToast();
  const fromSettings = () => ({ layout: { ...LAYOUT_DEFAULTS, ...settings.posLayout }, defaultOrderType: settings.defaultOrderType || 'dine-in' });
  const [f, setF] = useState(fromSettings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(fromSettings()), [settings.posLayout, settings.defaultOrderType]);

  const saved = fromSettings();
  const dirty = JSON.stringify(saved) !== JSON.stringify(f);
  const set = (k) => (v) => setF((cur) => ({ ...cur, layout: { ...cur.layout, [k]: v } }));
  const l = f.layout;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setSettings(await api('/settings', { method: 'PUT', body: { posLayout: l, defaultOrderType: f.defaultOrderType } }));
      toast('POS layout saved. Open POS screens update straight away.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="POS Layout" subtitle="Arrange the cashier screen to suit your menu. Changes apply to every POS screen as soon as you save." />
      <form onSubmit={save} className="grid max-w-6xl gap-6 lg:grid-cols-[1fr_420px]">
        <div className="card divide-y divide-white/10 px-6 py-2">
          <Choice
            label="New orders start as"
            hint="Preselected for every new order. Cashiers can still switch per order. Card (RFID) tabs are always dine-in."
            value={f.defaultOrderType}
            onChange={(defaultOrderType) => setF((cur) => ({ ...cur, defaultOrderType }))}
            options={[{ value: 'dine-in', label: '🍽️ Dine-in' }, { value: 'takeaway', label: '🥡 Takeaway' }]}
          />
          <Choice label="Product view" hint="List fits far more items on screen. Best for large menus." value={l.view} onChange={set('view')} options={[{ value: 'grid', label: 'Grid', icon: LayoutGrid }, { value: 'list', label: 'List', icon: LayoutList }]} />
          <Choice label="Product size" hint="Size of each tile or row." value={l.tileSize} onChange={set('tileSize')} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }, { value: 'xl', label: 'Extra large' }]} />
          <Choice label="Category menu position" value={l.menuPosition} onChange={set('menuPosition')} options={[{ value: 'left', label: 'Side', icon: PanelLeft }, { value: 'top', label: 'Top', icon: PanelTop }, { value: 'bottom', label: 'Bottom', icon: PanelBottom }]} />
          <Choice label="Category menu size" value={l.menuSize} onChange={set('menuSize')} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} />
          <Choice label="Order panel width" value={l.cartWidth} onChange={set('cartWidth')} options={[{ value: 'sm', label: 'Narrow' }, { value: 'md', label: 'Normal' }, { value: 'lg', label: 'Wide' }]} />
          <div className="flex items-center justify-between gap-3 py-4">
            <div>
              <div className="font-semibold">Show stock left</div>
              <div className="text-sm text-slate-400">Show “12 left” on each product.</div>
            </div>
            <Toggle checked={l.showStock} onChange={set('showStock')} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="mb-3 text-sm font-semibold">Preview</div>
            <Preview l={l} />
          </div>
          <div className="flex justify-end gap-2">
            {dirty && <button type="button" className="btn btn-ghost" onClick={() => setF(saved)}>Undo changes</button>}
            <button className="btn btn-primary" disabled={busy || !dirty}><Save size={16} /> {busy ? 'Saving...' : 'Save layout'}</button>
          </div>
        </div>
      </form>
    </>
  );
}
