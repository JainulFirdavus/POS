
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock3, HandCoins, Package, Receipt, ShoppingBasket, Tags, Trophy, TrendingUp, UtensilsCrossed, Vault, Wallet } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { presetRange, rangeQuery } from '../../lib/dates';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { Empty, PageHeader, Segmented, StatCard } from '../../components/ui';
import { METHOD_LABELS } from '../../components/PaymentModal';
import { ReasonBadge } from './CashDrawer';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
];
const PAY_COLORS = { cash: '#10b981', card: '#6366f1', qr: '#ec4899' };
const TOOLTIP = { contentStyle: { background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }, labelStyle: { color: '#94a3b8' } };

export default function Dashboard() {
  const { money } = useSettings();
  const toast = useToast();
  const [preset, setPreset] = useState('today');
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    const { from, to } = presetRange(preset);
    api(`/reports/summary?${rangeQuery(from, to)}`).then(setData).catch((e) => toast(e.message, 'error'));
  }, [preset, toast]);

  useEffect(() => {
    load();
    const s = getSocket();
    const events = ['invoices:changed', 'drawer:changed', 'tabs:changed'];
    events.forEach((e) => s.on(e, load));
    return () => events.forEach((e) => s.off(e, load));
  }, [load]);

  // Trim the hourly chart to the trading hours that actually had sales.
  const hours = useMemo(() => {
    const all = data?.hours ?? [];
    const used = all.filter((h) => h.invoices > 0).map((h) => h.hour);
    if (!used.length) return all.slice(8, 22);
    return all.slice(Math.max(0, Math.min(...used) - 1), Math.min(24, Math.max(...used) + 2));
  }, [data]);

  const t = data?.totals;
  const maxTop = Math.max(1, ...(data?.topProducts.map((p) => p.revenue) ?? []));
  const catTotal = (data?.categories ?? []).reduce((s, c) => s + c.revenue, 0) || 1;
  const dineIn = data?.orderTypes.find((o) => o.type === 'dine-in');
  const d = data?.drawer;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live overview — updates automatically as sales happen">
        <Segmented id="dash" value={preset} onChange={setPreset} options={PRESETS} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={Wallet} label="Revenue" value={t?.revenue ?? 0} format={money} color="#6366f1" />
        <StatCard icon={Receipt} label="Invoices" value={t?.count ?? 0} color="#10b981" delay={0.05} />
        <StatCard icon={ShoppingBasket} label="Items sold" value={t?.items ?? 0} color="#f59e0b" delay={0.1} />
        <StatCard icon={TrendingUp} label="Avg. ticket" value={t?.avg ?? 0} format={money} color="#ec4899" delay={0.15} />
        <StatCard icon={TrendingUp} label="Gross profit" value={t?.profit ?? 0} format={money} color="#06b6d4" delay={0.2} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold">Sales trend</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={data?.series ?? []}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={70} />
                <Tooltip {...TOOLTIP} formatter={(v) => money(v)} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#818cf8" strokeWidth={2.5} fill="url(#rev)" animationDuration={700} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card p-5">
          <h3 className="mb-4 font-semibold">Payment methods</h3>
          {data?.payments.length ? (
            <>
              <div className="h-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data.payments} dataKey="total" nameKey="method" innerRadius={50} outerRadius={80} paddingAngle={4} animationDuration={700}>
                      {data.payments.map((p) => <Cell key={p.method} fill={PAY_COLORS[p.method]} stroke="none" />)}
                    </Pie>
                    <Tooltip {...TOOLTIP} formatter={(v) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2">
                {data.payments.map((p) => (
                  <div key={p.method} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-full" style={{ background: PAY_COLORS[p.method] }} />
                    <span className="flex-1 text-slate-400">{METHOD_LABELS[p.method] ?? p.method}</span>
                    <span className="text-slate-500">{p.count}×</span>
                    <span className="font-semibold">{money(p.total)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty icon={Receipt} text="No sales in this period" />
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold">Top products</h3>
          {data?.topProducts.length ? (
            <div className="space-y-3">
              {data.topProducts.map((p, i) => (
                <div key={p._id} className="flex items-center gap-3">
                  <span className="w-5 text-sm text-slate-500">{i + 1}</span>
                  <span className="w-40 truncate text-sm font-medium">{p.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <motion.div
                      className="h-full origin-left rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: p.revenue / maxTop }}
                      transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 120, damping: 20 }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs text-slate-400">{p.qty} sold</span>
                  <span className="w-24 text-right text-sm font-semibold">{money(p.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Package} text="No products sold yet" />
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="card p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><AlertTriangle size={18} className="text-amber-400" /> Low stock</h3>
          {data?.lowStock.length ? (
            <div className="space-y-2">
              {data.lowStock.map((p) => (
                <div key={p._id} className="flex items-center gap-3 rounded-xl bg-slate-800/40 p-2.5">
                  <span className="text-2xl">{p.emoji}</span>
                  <span className="flex-1 truncate text-sm">{p.name}</span>
                  <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${p.stock <= 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`}>{p.stock}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Package} text="All products well stocked" />
          )}
        </motion.div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Vault} label="Drawer opens" value={d?.total ?? 0} color="#6366f1" delay={0.05} />
        <StatCard icon={HandCoins} label="No-sale drawer opens" value={d?.noSale ?? 0} color="#f59e0b" delay={0.1} />
        <StatCard icon={UtensilsCrossed} label="Dine-in orders" value={dineIn?.count ?? 0} color="#10b981" delay={0.15} />
        <StatCard icon={Clock3} label={`Open tabs now${data?.openTabs.count ? ` (${data.openTabs.count})` : ''}`} value={data?.openTabs.total ?? 0} format={money} color="#ec4899" delay={0.2} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold"><Clock3 size={18} className="text-indigo-300" /> Orders by hour</h3>
            {data?.busiestHour && <span className="text-xs text-slate-400">Busiest: <b className="text-slate-200">{data.busiestHour.label}</b> · {data.busiestHour.invoices} orders</span>}
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={hours}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis yAxisId="o" allowDecimals={false} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={30} />
                <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v, n) => (n === 'Sales' ? money(v) : v)} />
                <Bar yAxisId="o" dataKey="invoices" name="Orders" radius={[4, 4, 0, 0]} animationDuration={700}>
                  {hours.map((h) => <Cell key={h.hour} fill={h.hour === data?.busiestHour?.hour ? '#f59e0b' : '#6366f1'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold"><Vault size={18} className="text-indigo-300" /> Cash drawer</h3>
            <Link to="/admin/drawer" className="text-xs text-indigo-300 hover:underline">Full log →</Link>
          </div>
          {d?.total ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-emerald-500/10 p-2"><div className="text-xl font-bold text-emerald-300">{d.sale}</div><div className="text-[11px] text-slate-400">Cash sale</div></div>
                <div className="rounded-xl bg-amber-500/10 p-2"><div className="text-xl font-bold text-amber-300">{d.noSale}</div><div className="text-[11px] text-slate-400">No sale</div></div>
                <div className={`rounded-xl p-2 ${d.failed ? 'bg-rose-500/10' : 'bg-white/5'}`}><div className={`text-xl font-bold ${d.failed ? 'text-rose-300' : 'text-slate-300'}`}>{d.failed}</div><div className="text-[11px] text-slate-400">Failed</div></div>
              </div>
              <div className="mt-4 space-y-1.5">
                {d.recent.slice(0, 6).map((e) => (
                  <div key={e._id} className="flex items-center gap-2 text-sm">
                    <span className="w-12 text-xs text-slate-500">{new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <ReasonBadge reason={e.reason} />
                    <span className="min-w-0 flex-1 truncate text-slate-300" title={e.note}>{e.user?.name}{e.note ? ` · ${e.note}` : ''}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty icon={Vault} text="Drawer not opened in this period" />
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card p-5 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Tags size={18} className="text-indigo-300" /> Sales by category</h3>
          {data?.categories.length ? (
            <div className="space-y-3">
              {data.categories.map((c, i) => (
                <div key={c._id ?? 'none'} className="flex items-center gap-3">
                  <span className="w-6 text-center text-lg">{c.emoji}</span>
                  <span className="w-36 truncate text-sm font-medium">{c.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <motion.div className="h-full origin-left rounded-full" style={{ background: c.color }} initial={{ scaleX: 0 }} animate={{ scaleX: c.revenue / catTotal }} transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 120, damping: 20 }} />
                  </div>
                  <span className="w-12 text-right text-xs text-slate-400">{Math.round((c.revenue / catTotal) * 100)}%</span>
                  <span className="w-14 text-right text-xs text-slate-400">{c.qty} sold</span>
                  <span className="w-24 text-right text-sm font-semibold">{money(c.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={Tags} text="No category sales yet" />
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="card p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold"><Trophy size={18} className="text-amber-400" /> Largest orders</h3>
          {data?.biggestOrders.length ? (
            <div className="space-y-2">
              {data.biggestOrders.map((o) => (
                <div key={o._id} className="flex items-center gap-3 rounded-xl bg-slate-800/40 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs">{o.number}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {o.items} items · {o.cashier?.name}{o.table ? ` · ${o.table}` : ''}
                    </div>
                  </div>
                  <span className="font-bold">{money(o.total)}</span>
                </div>
              ))}
              {data.cashiers.length > 0 && (
                <div className="border-t border-white/5 pt-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">By cashier</div>
                  {data.cashiers.map((c) => (
                    <div key={c.name} className="flex justify-between text-sm"><span className="text-slate-300">{c.name} <span className="text-slate-500">({c.count})</span></span><span className="font-semibold">{money(c.total)}</span></div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Empty icon={Trophy} text="No orders yet" />
          )}
        </motion.div>
      </div>
    </>
  );
} 