import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, FileSpreadsheet, HandCoins, Vault, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, download } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { presetRange, rangeQuery, tz } from '../../lib/dates';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { Empty, PageHeader, Segmented, StatCard } from '../../components/ui';
import { NoSaleModal } from '../../components/DineIn';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 Days' },
  { value: 'month', label: 'This Month' },
];
export const REASON_META = {
  sale: { label: 'Cash sale', color: '#10b981' },
  'no-sale': { label: 'No sale', color: '#f59e0b' },
  test: { label: 'Test', color: '#64748b' },
};
const TOOLTIP = { contentStyle: { background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }, labelStyle: { color: '#94a3b8' } };
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23' });

export function ReasonBadge({ reason }) {
  const m = REASON_META[reason] ?? { label: reason, color: '#64748b' };
  return <span className="rounded-lg px-2 py-0.5 text-xs font-semibold" style={{ background: `${m.color}22`, '--ink': m.color }}><span className="ink">{m.label}</span></span>;
}

export default function CashDrawer() {
  const { money } = useSettings();
  const toast = useToast();
  const [preset, setPreset] = useState('today');
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [noSaleOpen, setNoSaleOpen] = useState(false);

  const load = useCallback(() => {
    const { from, to } = presetRange(preset);
    api(`/hardware/drawer/events?${rangeQuery(from, to)}`).then(setEvents).catch((e) => toast(e.message, 'error'));
  }, [preset, toast]);

  useEffect(() => {
    load();
    const s = getSocket();
    s.on('drawer:changed', load);
    return () => s.off('drawer:changed', load);
  }, [load]);

  // Opens per hour for a single day, otherwise per day; stacked by reason.
  const chart = useMemo(() => {
    const single = preset === 'today';
    const buckets = new Map();
    if (single) for (let h = 0; h < 24; h++) buckets.set(String(h).padStart(2, '0'), { label: `${String(h).padStart(2, '0')}:00`, sale: 0, 'no-sale': 0, test: 0 });
    for (const e of [...events].reverse()) {
      const d = new Date(e.createdAt);
      const key = single ? hourFmt.format(d) : dayFmt.format(d);
      const b = buckets.get(key) ?? { label: single ? `${key}:00` : key.slice(5), sale: 0, 'no-sale': 0, test: 0 };
      b[e.reason] = (b[e.reason] ?? 0) + 1;
      buckets.set(key, b);
    }
    let rows = [...buckets.values()];
    if (single) {
      const used = rows.map((r, i) => (r.sale + r['no-sale'] + r.test ? i : -1)).filter((i) => i >= 0);
      rows = used.length ? rows.slice(Math.max(0, used[0] - 1), Math.min(24, used.at(-1) + 2)) : rows.slice(8, 22);
    }
    return rows;
  }, [events, preset]);

  const count = (r) => events.filter((e) => e.reason === r).length;
  const failed = events.filter((e) => !e.ok).length;
  const shown = filter === 'all' ? events : events.filter((e) => e.reason === filter);
  const byUser = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      const u = m.get(e.user?.name) ?? { name: e.user?.name ?? '-', total: 0, noSale: 0 };
      u.total += 1;
      if (e.reason === 'no-sale') u.noSale += 1;
      m.set(u.name, u);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [events]);

  const exportXlsx = async () => {
    const { from, to } = presetRange(preset);
    try {
      await download(`/reports/export?${rangeQuery(from, to, { type: 'drawer', format: 'xlsx' })}`, 'drawer.xlsx');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader title="Cash Drawer" subtitle="Every time the drawer opens: when, why and by whom">
        <Segmented id="drawer" value={preset} onChange={setPreset} options={PRESETS} />
        <button className="btn btn-ghost" onClick={exportXlsx}><FileSpreadsheet size={16} /> Export</button>
        <button className="btn btn-primary" onClick={() => setNoSaleOpen(true)}><Vault size={16} /> Open drawer</button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Vault} label="Total opens" value={events.length} color="#6366f1" />
        <StatCard icon={Banknote} label="Cash sales" value={count('sale')} color="#10b981" delay={0.05} />
        <StatCard icon={HandCoins} label="No-sale opens" value={count('no-sale')} color="#f59e0b" delay={0.1} />
        <StatCard icon={failed ? AlertTriangle : Wrench} label={failed ? 'Failed to open' : 'Tests'} value={failed || count('test')} color={failed ? '#ef4444' : '#64748b'} delay={0.15} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold">Opens {preset === 'today' ? 'by hour' : 'by day'}</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chart}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={30} />
                <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {Object.entries(REASON_META).map(([k, m]) => <Bar key={k} dataKey={k} name={m.label} stackId="a" fill={m.color} radius={k === 'test' ? [4, 4, 0, 0] : 0} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">By cashier</h3>
          {byUser.length ? (
            <div className="space-y-2">
              {byUser.map((u) => (
                <div key={u.name} className="flex items-center gap-3 rounded-xl bg-slate-800/40 p-2.5 text-sm">
                  <span className="flex-1 truncate font-medium">{u.name}</span>
                  <span className="text-slate-400">{u.total} opens</span>
                  <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${u.noSale ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-slate-400'}`}>{u.noSale} no-sale</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Vault} text="No drawer opens" />
          )}
        </div>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
          <span className="font-semibold">Drawer log</span>
          <Segmented id="drawer-filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'no-sale', label: 'No sale' }, { value: 'sale', label: 'Cash sale' }]} />
        </div>
        {shown.length ? (
          <table className="w-full">
            <thead><tr><th className="th">Time</th><th className="th">Reason</th><th className="th">By</th><th className="th">Invoice</th><th className="th text-right">Amount</th><th className="th">Note</th><th className="th">Status</th></tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e._id} className="border-t border-white/5">
                  <td className="td whitespace-nowrap text-slate-400">{new Date(e.createdAt).toLocaleString([], { dateStyle: preset === 'today' ? undefined : 'short', timeStyle: 'short' })}</td>
                  <td className="td"><ReasonBadge reason={e.reason} /></td>
                  <td className="td">{e.user?.name}</td>
                  <td className="td font-mono text-xs">{e.invoiceNumber || '-'}</td>
                  <td className="td text-right">{e.amount != null ? money(e.amount) : '-'}</td>
                  <td className="td max-w-56 truncate text-slate-300" title={e.note}>{e.note || '-'}</td>
                  <td className="td text-xs">{e.ok ? <span className="text-emerald-400">{e.device === 'browser' ? 'Logged' : 'Opened'}</span> : <span className="text-rose-400" title={e.error}>Failed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon={Vault} text="No drawer opens in this period" />
        )}
      </div>

      <NoSaleModal open={noSaleOpen} onClose={() => setNoSaleOpen(false)} />
    </>
  );
}
