import { useCallback, useEffect, useState } from 'react';
import { Ban, FileSpreadsheet, Printer, Receipt, Search } from 'lucide-react';
import { api, download } from '../../lib/api';
import { endOfDay, fmtDateTime, fromInput, rangeQuery, startOfDay, toInputDate } from '../../lib/dates';
import { getSocket } from '../../lib/socket';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import { METHOD_LABELS } from '../../components/PaymentModal';
import { PrintPortal, ReceiptPaper } from '../../components/Receipt';
import { Empty, Field, PageHeader } from '../../components/ui';

export default function Invoices() {
  const { settings, money } = useSettings();
  const toast = useToast();
  const today = toInputDate(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);

  const query = useCallback(() => rangeQuery(startOfDay(fromInput(from)), endOfDay(fromInput(to))), [from, to]);

  const load = useCallback(() => {
    api(`/invoices?${query()}&q=${encodeURIComponent(q)}`).then(setList).catch((e) => toast(e.message, 'error'));
  }, [query, q, toast]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    const s = getSocket();
    s.on('invoices:changed', load);
    return () => {
      clearTimeout(t);
      s.off('invoices:changed', load);
    };
  }, [load]);

  const voidInvoice = async () => {
    if (!window.confirm(`Void ${selected.number}? Stock will be returned.`)) return;
    try {
      setSelected(await api(`/invoices/${selected._id}/void`, { method: 'POST' }));
      toast('Invoice voided', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const paid = list.filter((i) => i.status === 'paid');
  const total = paid.reduce((s, i) => s + i.total, 0);

  return (
    <>
      <PageHeader title="Invoices" subtitle={`${paid.length} paid · ${money(total)}`}>
        <button className="btn btn-ghost" onClick={() => download(`/reports/export?type=invoices&format=xlsx&${query()}`, 'invoices.xlsx').catch((e) => toast(e.message, 'error'))}>
          <FileSpreadsheet size={16} /> Export Excel
        </button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From"><input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="relative min-w-64 flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-10" placeholder="Search invoice number..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-white/5 bg-slate-900">
            <tr><th className="th">Invoice</th><th className="th">Date</th><th className="th">Cashier</th><th className="th text-center">Items</th><th className="th">Payment</th><th className="th text-right">Total</th><th className="th">Status</th></tr>
          </thead>
          <tbody>
            {list.map((inv, i) => (
              <tr key={inv._id} onClick={() => setSelected(inv)} className="animate-pop-in cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.03]" style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}>
                <td className="td font-mono font-medium">
                  {inv.number}
                  <span className={`ml-2 rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold ${inv.orderType === 'dine-in' ? 'bg-amber-500/15 text-amber-300' : 'bg-white/5 text-slate-400'}`}>{inv.orderType === 'dine-in' ? `Dine-in${inv.table ? ` · ${inv.table}` : ''}` : 'Takeaway'}</span>
                </td>
                <td className="td text-slate-400">{fmtDateTime(inv.createdAt)}</td>
                <td className="td">{inv.cashier?.name}</td>
                <td className="td text-center">{inv.items.reduce((s, l) => s + l.qty, 0)}</td>
                <td className="td text-slate-400">{METHOD_LABELS[inv.paymentMethod] ?? inv.paymentMethod}</td>
                <td className="td text-right font-semibold">{money(inv.total)}</td>
                <td className="td">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${inv.status === 'paid' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{inv.status.toUpperCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <Empty icon={Receipt} text="No invoices for this period" />}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.number}
        width="max-w-md"
        footer={
          <>
            {selected?.status === 'paid' && <button className="btn btn-danger" onClick={voidInvoice}><Ban size={16} /> Void</button>}
            <button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /> Print</button>
          </>
        }
      >
        {selected && (
          <>
            <div className="overflow-hidden rounded-xl"><ReceiptPaper invoice={selected} settings={settings} money={money} /></div>
            <PrintPortal><ReceiptPaper invoice={selected} settings={settings} money={money} /></PrintPortal>
          </>
        )}
      </Modal>
    </>
  );
} 