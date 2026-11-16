
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Boxes, CalendarDays, FileSpreadsheet, FileText, Receipt, Sheet, ShoppingBasket, TrendingUp, Wallet } from 'lucide-react';
import { api, download } from '../../lib/api';
import { endOfDay, endOfMonth, fromInput, rangeQuery, startOfDay, startOfMonth, toInputDate, toInputMonth } from '../../lib/dates';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { Field, PageHeader, Segmented, StatCard } from '../../components/ui';

const REPORTS = [
  { type: 'invoices', title: 'Invoice Register', desc: 'Every invoice with totals, tax, discount and payment method', icon: Receipt, color: '#6366f1' },
  { type: 'daily', title: 'Day-wise Summary', desc: 'Sales totals grouped per day — ideal for monthly reports', icon: CalendarDays, color: '#10b981' },
  { type: 'sales', title: 'Product Sales List', desc: 'Quantity, revenue, cost and profit per product', icon: ShoppingBasket, color: '#f59e0b' },
  { type: 'stock', title: 'Stock Report', desc: 'Current stock levels and inventory value (live)', icon: Boxes, color: '#ec4899' },
];
const FORMATS = [
  { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
  { id: 'csv', label: 'CSV', icon: Sheet },
  { id: 'pdf', label: 'PDF', icon: FileText },
];

export default function Reports() {
  const { money } = useSettings();
  const toast = useToast();
  const now = new Date();
  const [period, setPeriod] = useState('daily');
  const [day, setDay] = useState(toInputDate(now));
  const [month, setMonth] = useState(toInputMonth(now));
  const [from, setFrom] = useState(toInputDate(startOfMonth(now)));
  const [to, setTo] = useState(toInputDate(now));
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState('');

  const range = useMemo(() => {
    if (period === 'daily') return { from: startOfDay(fromInput(day)), to: endOfDay(fromInput(day)) };
    if (period === 'monthly') return { from: startOfMonth(fromInput(month)), to: endOfMonth(fromInput(month)) };
    return { from: startOfDay(fromInput(from)), to: endOfDay(fromInput(to)) };
  }, [period, day, month, from, to]);

  useEffect(() => {
    if (range.from > range.to) return;
    api(`/reports/summary?${rangeQuery(range.from, range.to)}`).then(setSummary).catch((e) => toast(e.message, 'error'));
  }, [range, toast]);

  const exportReport = async (type, format) => {
    const key = `${type}-${format}`;
    setBusy(key);
    try {
      await download(`/reports/export?${rangeQuery(range.from, range.to, { type, format })}`, `${type}.${format}`);
      toast('Report downloaded', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const t = summary?.totals;

  return (
    <>
      <PageHeader title="Reports & Export" subtitle="Download daily or monthly invoices, sales lists and stock reports">
        <Segmented id="period" value={period} onChange={setPeriod} options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }, { value: 'custom', label: 'Custom' }]} />
      </PageHeader>

      <motion.div layout className="card mb-6 flex flex-wrap items-end gap-4 p-5">
        {period === 'daily' && <Field label="Date"><input type="date" className="input" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></Field>}
        {period === 'monthly' && <Field label="Month"><input type="month" className="input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>}
        {period === 'custom' && (
          <>
            <Field label="From"><input type="date" className="input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" className="input" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></Field>
          </>
        )}
        <div className="pb-2.5 text-sm text-slate-400">
          {range.from.toLocaleDateString()} → {range.to.toLocaleDateString()}
        </div>
      </motion.div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Net sales" value={t?.revenue ?? 0} format={money} color="#6366f1" />
        <StatCard icon={Receipt} label="Invoices" value={t?.count ?? 0} color="#10b981" delay={0.05} />
        <StatCard icon={BarChart3} label="Tax collected" value={t?.tax ?? 0} format={money} color="#f59e0b" delay={0.1} />
        <StatCard icon={TrendingUp} label="Gross profit" value={t?.profit ?? 0} format={money} color="#ec4899" delay={0.15} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r, i) => (
          <motion.div
            key={r.type}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            whileHover={{ y: -3 }}
            className="card flex flex-col p-5"
          >
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: `${r.color}22`, color: r.color }}><r.icon size={22} /></div>
              <div>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{r.desc}</p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              {FORMATS.map((f) => (
                <button key={f.id} onClick={() => exportReport(r.type, f.id)} disabled={!!busy} className="btn btn-ghost flex-1">
                  <f.icon size={16} /> {busy === `${r.type}-${f.id}` ? '...' : f.label}
                </button>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {summary?.topProducts.length > 0 && (
        <div className="card mt-8 overflow-hidden">
          <div className="border-b border-white/5 px-5 py-4 font-semibold">Top selling products in this period</div>
          <table className="w-full">
            <thead><tr><th className="th">Product</th><th className="th text-right">Qty</th><th className="th text-right">Revenue</th><th className="th text-right">Profit</th></tr></thead>
            <tbody>
              {summary.topProducts.map((p) => (
                <tr key={p._id} className="border-t border-white/5">
                  <td className="td">{p.name}</td>
                  <td className="td text-right">{p.qty}</td>
                  <td className="td text-right font-semibold">{money(p.revenue)}</td>
                  <td className="td text-right text-emerald-400">{money(p.revenue - p.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
 