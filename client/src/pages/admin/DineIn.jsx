import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CreditCard, Nfc, Pencil, Plus, Trash2, Users, UtensilsCrossed, Wallet, X } from 'lucide-react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { fmtDateTime } from '../../lib/dates';
import { normUid } from '../../lib/rfid';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { ColorPicker, Empty, Field, PageHeader, StatCard, Toggle } from '../../components/ui';
import { tabCount, tabSubtotal } from '../../components/DineIn';

const minutesSince = (d) => Math.max(0, Math.round((Date.now() - new Date(d)) / 60000));

function RegisterCard({ cards, onSaved }) {
  const toast = useToast();
  const [uid, setUid] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#f59e0b');
  const [busy, setBusy] = useState(false);
  const uidRef = useRef(null);
  const labelRef = useRef(null);

  // Suggest the next table name, e.g. "Table 4" after "Table 3".
  const suggest = () => {
    const nums = cards.map((c) => Number(/^Table (\d+)$/i.exec(c.label)?.[1])).filter(Boolean);
    return `Table ${nums.length ? Math.max(...nums) + 1 : cards.length + 1}`;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!uid.trim()) return uidRef.current?.focus();
    setBusy(true);
    try {
      await api('/rfid', { method: 'POST', body: { uid, label: label.trim() || suggest(), color } });
      toast(`${label.trim() || suggest()} registered`, 'success');
      setUid('');
      setLabel('');
      onSaved();
      uidRef.current?.focus();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-5">
      <h3 className="mb-1 flex items-center gap-2 font-semibold"><Plus size={18} /> Register a card</h3>
      <p className="mb-4 text-sm text-slate-400">Click the card number box and tap the card on the USB reader. It types the number for you.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Card number">
          <div className="relative">
            <Nfc size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" />
            <input
              ref={uidRef}
              autoFocus
              className="input pl-10 font-mono"
              placeholder="Tap card on reader..."
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (uid.trim()) labelRef.current?.focus();
                }
              }}
            />
          </div>
        </Field>
        <Field label="Name (table or card)">
          <input ref={labelRef} className="input" maxLength={40} placeholder={suggest()} value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Colour" className="sm:col-span-2"><ColorPicker value={color} onChange={setColor} /></Field>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-xs text-slate-500">{uid && `Saved as ${normUid(uid)}`}</span>
        <button className="btn btn-primary" disabled={busy || !uid.trim()}><Plus size={16} /> Register card</button>
      </div>
    </form>
  );
}

function CardRow({ card, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(card.label);

  const update = async (body) => {
    try {
      await api(`/rfid/${card._id}`, { method: 'PUT', body });
      onChanged();
      setEditing(false);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${card.label}? The card will stop working until registered again.`)) return;
    try {
      await api(`/rfid/${card._id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <tr className="border-t border-white/5">
      <td className="td">
        {editing ? (
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); update({ label }); }}>
            <input className="input py-1.5" autoFocus maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
            <button className="btn btn-ghost px-2"><Check size={14} /></button>
            <button type="button" className="btn btn-ghost px-2" onClick={() => { setEditing(false); setLabel(card.label); }}><X size={14} /></button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: card.color }} />
            <span className="font-semibold">{card.label}</span>
          </div>
        )}
      </td>
      <td className="td font-mono text-xs text-slate-400">
        {card.virtual ? <span className="font-sans text-slate-500">On-screen table (no card)</span> : card.uid}
        {card.table && <div className="font-sans text-[11px] text-indigo-300">Floor plan: {card.table}</div>}
      </td>
      <td className="td">
        {card.openTab ? <span className="rounded-lg bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">In use</span> : <span className="rounded-lg bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">Free</span>}
      </td>
      <td className="td"><Toggle checked={card.active} onChange={(active) => update({ active })} /></td>
      <td className="td text-right">
        <button title="Rename" onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><Pencil size={15} /></button>
        <button title="Delete" onClick={remove} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"><Trash2 size={15} /></button>
      </td>
    </tr>
  );
}

function OpenTabCard({ tab, money, onCancel }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div layout className="card overflow-hidden" style={{ borderColor: `${tab.color}55` }}>
      <button className="w-full p-4 text-left" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: tab.color }} />
          <span className="flex-1 truncate font-bold">{tab.label}</span>
          <span className="text-xs text-slate-400">{minutesSince(tab.createdAt)} min</span>
        </div>
        <div className="mt-2 text-2xl font-black tabular-nums">{money(tabSubtotal(tab))}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Users size={12} /> {tab.guests} · {tabCount(tab)} items · by {tab.openedBy?.name}</div>
      </button>
      {open && (
        <div className="border-t border-white/5 px-4 py-3 text-sm">
          {tab.items.map((it) => (
            <div key={it._id} className="flex justify-between py-0.5">
              <span className="truncate">{it.qty} × {it.name}</span>
              <span className="tabular-nums text-slate-400">{money(it.price * it.qty)}</span>
            </div>
          ))}
          {!tab.items.length && <div className="text-slate-500">No items yet</div>}
          <button onClick={() => onCancel(tab)} className="btn btn-danger mt-3 w-full py-1.5 text-xs"><Trash2 size={14} /> Cancel tab{tab.items.length ? ' & return stock' : ''}</button>
        </div>
      )}
    </motion.div>
  );
}

export default function DineIn() {
  const { money } = useSettings();
  const toast = useToast();
  const [cards, setCards] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [closed, setClosed] = useState([]);

  const load = useCallback(() => {
    Promise.all([api('/rfid'), api('/tabs'), api('/tabs?status=closed')])
      .then(([c, t, x]) => {
        setCards(c);
        setTabs(t);
        setClosed(x);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [toast]);

  useEffect(() => {
    load();
    const s = getSocket();
    s.on('tabs:changed', load);
    return () => s.off('tabs:changed', load);
  }, [load]);

  const cancel = async (tab) => {
    if (!window.confirm(`Cancel ${tab.label}'s tab?${tab.items.length ? ' Its items will be returned to stock and it will not be charged.' : ''}`)) return;
    try {
      await api(`/tabs/${tab._id}/cancel`, { method: 'POST' });
      toast('Tab cancelled', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const openValue = tabs.reduce((s, t) => s + tabSubtotal(t), 0);

  return (
    <>
      <PageHeader title="Dine-in & RFID cards" subtitle="Give each table or customer an RFID card: tap to open a tab, add orders during the meal, then pay and close" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CreditCard} label="Registered cards" value={cards.length} color="#f59e0b" />
        <StatCard icon={UtensilsCrossed} label="Open tabs" value={tabs.length} color="#10b981" delay={0.05} />
        <StatCard icon={Wallet} label="Open tab value" value={openValue} format={money} color="#6366f1" delay={0.1} />
        <StatCard icon={Users} label="Guests seated" value={tabs.reduce((s, t) => s + t.guests, 0)} color="#ec4899" delay={0.15} />
      </div>

      <h2 className="mb-3 font-semibold">Open tabs</h2>
      {tabs.length ? (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {tabs.map((t) => <OpenTabCard key={t._id} tab={t} money={money} onCancel={cancel} />)}
        </div>
      ) : (
        <div className="card mb-8"><Empty icon={UtensilsCrossed} text="No open tabs. Tap a card at the POS to open one." /></div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <RegisterCard cards={cards} onSaved={load} />
          <div className="card p-5 text-sm text-slate-300">
            <h3 className="mb-2 font-semibold text-white">How it works at the POS</h3>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Tap a free card: a tab opens for that table.</li>
              <li>Add products and press <b>Send to tab</b>. Repeat for each round of orders.</li>
              <li>Tap the card again (or choose it under <b>Dine-in</b>) and press <b>Pay & close</b>.</li>
              <li>The card is free for the next customer.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-400">Any USB RFID/NFC reader that works as a keyboard (125 kHz EM or 13.56 MHz MIFARE) is supported. No driver needed.</p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-white/5 px-5 py-4 font-semibold">Cards ({cards.length})</div>
          {cards.length ? (
            <table className="w-full">
              <thead><tr><th className="th">Name</th><th className="th">Card number</th><th className="th">Status</th><th className="th">Active</th><th className="th" /></tr></thead>
              <tbody>{cards.map((c) => <CardRow key={c._id} card={c} onChanged={load} />)}</tbody>
            </table>
          ) : (
            <Empty icon={Nfc} text="No cards registered yet" />
          )}
        </div>
      </div>

      {closed.length > 0 && (
        <div className="card mt-6 overflow-hidden">
          <div className="border-b border-white/5 px-5 py-4 font-semibold">Recently closed tabs</div>
          <table className="w-full">
            <thead><tr><th className="th">Table</th><th className="th">Opened</th><th className="th">Closed</th><th className="th">By</th><th className="th text-right">Items</th><th className="th text-right">Subtotal</th><th className="th">Status</th></tr></thead>
            <tbody>
              {closed.slice(0, 30).map((t) => (
                <tr key={t._id} className="border-t border-white/5">
                  <td className="td font-semibold">{t.label}</td>
                  <td className="td text-slate-400">{fmtDateTime(t.createdAt)}</td>
                  <td className="td text-slate-400">{t.closedAt ? fmtDateTime(t.closedAt) : '-'}</td>
                  <td className="td">{t.closedBy}</td>
                  <td className="td text-right">{tabCount(t)}</td>
                  <td className="td text-right font-semibold">{money(tabSubtotal(t))}</td>
                  <td className="td">{t.status === 'closed' ? <span className="text-emerald-400">Paid</span> : t.status === 'merged' ? <span className="text-indigo-300">Combined / split</span> : <span className="text-rose-400">Cancelled</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
