import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft, Combine, Minus, Nfc, Plus, Split, Trash2, Users, UtensilsCrossed, Vault, X } from 'lucide-react';
import Modal from './Modal';
import { api } from '../lib/api';
import { round2 } from '../lib/dates';
import { normUid, useCardScanner } from '../lib/rfid';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';

export const tabSubtotal = (tab) => round2((tab?.items ?? []).reduce((s, i) => s + i.price * i.qty, 0));
export const tabCount = (tab) => (tab?.items ?? []).reduce((s, i) => s + i.qty, 0);
const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const minutesSince = (d) => Math.max(0, Math.round((Date.now() - new Date(d)) / 60000));

export function ScanHint({ text = 'Tap a customer card on the reader' }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-dashed border-amber-400/40 bg-amber-500/5 p-4">
      <motion.div animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.6, repeat: Infinity }} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
        <Nfc size={26} />
      </motion.div>
      <div className="text-sm">
        <div className="font-semibold">{text}</div>
        <div className="text-slate-400">An open tab is loaded; a free card starts a new tab.</div>
      </div>
    </div>
  );
}

export function TabsModal({ open, onClose, tabs, onSelect }) {
  const { money } = useSettings();
  return (
    <Modal open={open} onClose={onClose} title="Dine-in tabs" width="max-w-3xl">
      <ScanHint />
      <div className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Open tabs ({tabs.length})</div>
      {tabs.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {tabs.map((t) => (
            <button key={t._id} onClick={() => onSelect(t)} className="rounded-2xl border border-white/5 bg-slate-800/50 p-4 text-left transition hover:border-[var(--c)] active:scale-95" style={{ '--c': t.color }}>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                <span className="truncate font-bold">{t.label}</span>
              </div>
              <div className="mt-2 text-2xl font-black tabular-nums">{money(tabSubtotal(t))}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1"><Users size={12} /> {t.guests} · {tabCount(t)} items</span>
                <span>{minutesSince(t.createdAt)} min</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-10 text-slate-500">
          <UtensilsCrossed size={36} strokeWidth={1.5} />
          <p className="text-sm">No open tabs</p>
        </div>
      )}
    </Modal>
  );
}

export function OpenTabModal({ card, onClose, onOpened }) {
  const toast = useToast();
  const [guests, setGuests] = useState(1);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (card) setGuests(1);
  }, [card]);

  const open = async () => {
    setBusy(true);
    try {
      onOpened(await api('/tabs', { method: 'POST', body: { uid: card.uid, guests } }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!card}
      onClose={onClose}
      title="Start dine-in tab"
      width="max-w-sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-success" disabled={busy} onClick={open}>{busy ? 'Opening...' : 'Open tab'}</button>
        </>
      }
    >
      {card && (
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl" style={{ background: `${card.color}26`, color: card.color }}><Nfc size={32} /></div>
          <div className="mt-3 text-2xl font-black">{card.label}</div>
          <div className="text-xs text-slate-500">Card {card.uid}</div>
          <div className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-400">Guests</div>
          <div className="mt-2 flex items-center justify-center gap-3">
            <button className="btn btn-ghost h-11 w-11 p-0" onClick={() => setGuests((g) => Math.max(1, g - 1))}><Minus size={16} /></button>
            <span className="w-10 text-3xl font-black tabular-nums">{guests}</span>
            <button className="btn btn-ghost h-11 w-11 p-0" onClick={() => setGuests((g) => Math.min(99, g + 1))}><Plus size={16} /></button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Banner and already-ordered items shown at the top of the order panel while a tab is loaded.
export function TabPanel({ tab, onExit, onCancel, onTabChange, onSplit, onMerge, canMerge }) {
  const { money } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  const setQty = async (item, qty) => {
    setBusy(item._id);
    try {
      onTabChange(await api(`/tabs/${tab._id}/items/${item._id}`, { method: 'PATCH', body: { qty } }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-3 mb-2 overflow-hidden rounded-2xl border" style={{ borderColor: `${tab.color}66`, background: `${tab.color}12` }}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${tab.color}33`, color: tab.color }}><UtensilsCrossed size={18} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{tab.label} <span className="text-xs font-normal text-slate-400">· {tab.guests} guest{tab.guests > 1 ? 's' : ''}</span></div>
          <div className="text-xs text-slate-400">Opened {time(tab.createdAt)} by {tab.openedBy?.name} · {minutesSince(tab.createdAt)} min</div>
        </div>
        {tab.items.length > 0 && <button title="Split: move items to another card" onClick={onSplit} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10"><Split size={15} /> Split</button>}
        {canMerge && <button title="Combine another card's tab into this one" onClick={onMerge} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10"><Combine size={15} /> Combine</button>}
        {!tab.items.length && <button title="Cancel empty tab" onClick={onCancel} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"><Trash2 size={16} /></button>}
        <button title="Leave this tab (it stays open)" onClick={onExit} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X size={18} /></button>
      </div>
      {tab.items.length > 0 && (
        <div className="max-h-48 space-y-1 overflow-y-auto border-t border-white/5 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Already ordered</div>
          {tab.items.map((it) => (
            <div key={it._id} className={`flex items-center gap-2 text-sm ${busy === it._id ? 'opacity-50' : ''}`}>
              <span className="w-6 text-center">{it.emoji || '🍽️'}</span>
              <span className="min-w-0 flex-1 truncate">{it.name}<span className="ml-1 text-[11px] text-slate-500">{time(it.addedAt)}{it.from ? ` · from ${it.from}` : ''}</span></span>
              <button disabled={!!busy} onClick={() => setQty(it, it.qty - 1)} className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/10">
                {it.qty === 1 ? <Trash2 size={12} className="text-rose-400" /> : <Minus size={12} />}
              </button>
              <span className="w-5 text-center font-bold tabular-nums">{it.qty}</span>
              <button disabled={!!busy} onClick={() => setQty(it, it.qty + 1)} className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/10 disabled:opacity-30"><Plus size={12} /></button>
              <span className="w-20 text-right tabular-nums">{money(it.price * it.qty)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const NO_SALE_REASONS = ['Give change', 'Cash float top-up', 'Cash pickup / bank-in', 'Count the drawer', 'Refund to customer'];

export function NoSaleModal({ open, onClose }) {
  const toast = useToast();
  const { settings } = useSettings();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  const submit = async (reason) => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await api('/hardware/drawer/open', { method: 'POST', body: { note: reason.trim() } });
      if ((settings.printer?.mode ?? 'browser') === 'browser') toast('Drawer open logged. No printer is connected, so open the drawer with its key.', 'info');
      else toast('Drawer opened', 'success');
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Open cash drawer (No sale)" width="max-w-md">
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
        <Vault size={20} className="shrink-0" />
        Every drawer open is recorded with your name and reason, and reported to the admin.
      </div>
      <div className="space-y-2">
        {NO_SALE_REASONS.map((r) => (
          <button key={r} disabled={busy} onClick={() => submit(r)} className="w-full rounded-xl bg-slate-800/60 px-4 py-3 text-left text-sm transition hover:bg-slate-800 active:scale-[0.98]">{r}</button>
        ))}
      </div>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(note); }}>
        <input className="input" placeholder="Other reason..." maxLength={160} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !note.trim()}>Open</button>
      </form>
    </Modal>
  );
}

// Split: move some items (or part of a quantity) to another card, e.g. to pay separately.
export function SplitTabModal({ tab, open, onClose, tabs, onDone }) {
  const { money } = useSettings();
  const toast = useToast();
  const [sel, setSel] = useState({});
  const [cards, setCards] = useState([]);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel({});
    setTarget(null);
    api('/rfid').then(setCards).catch(() => setCards([]));
  }, [open]);

  const otherTabs = tabs.filter((t) => t._id !== tab?._id);
  const freeCards = cards.filter((c) => c.active && !c.openTab && c._id !== tab?.card);
  // Tapping a card on the reader picks it as the destination.
  useCardScanner((raw) => {
    const uid = normUid(raw);
    const existing = otherTabs.find((t) => t.cardUid === uid);
    const card = cards.find((c) => c.uid === uid);
    if (existing) setTarget({ tabId: existing._id, label: existing.label });
    else if (card) setTarget({ uid, label: card.label });
    else toast('Card not registered', 'error');
  }, open);

  const picked = Object.entries(sel).filter(([, q]) => q > 0);
  const amount = round2(picked.reduce((s, [id, q]) => s + (tab?.items.find((i) => i._id === id)?.price ?? 0) * q, 0));
  const setQty = (it, q) => setSel((cur) => ({ ...cur, [it._id]: Math.max(0, Math.min(it.qty, q)) }));

  const submit = async () => {
    setBusy(true);
    try {
      const body = { items: picked.map(([itemId, qty]) => ({ itemId, qty })), ...(target.tabId ? { toTabId: target.tabId } : { toUid: target.uid }) };
      const r = await api(`/tabs/${tab._id}/move`, { method: 'POST', body });
      toast(`Moved ${money(amount)} to ${r.target.label}`, 'success');
      onDone(r);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open && !!tab}
      onClose={onClose}
      title={`Split ${tab?.label ?? ''}`}
      width="max-w-3xl"
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-400">{picked.length ? `${money(amount)} selected` : 'Choose items to move'}</span>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !picked.length || !target} onClick={submit}>
            <ArrowRightLeft size={16} /> {target ? `Move to ${target.label}` : 'Choose a card'}
          </button>
        </>
      }
    >
      {tab && (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>1. Items to move</span>
              <button className="normal-case text-indigo-300 hover:underline" onClick={() => setSel(Object.fromEntries(tab.items.map((i) => [i._id, i.qty])))}>Select all</button>
            </div>
            <div className="space-y-1.5">
              {tab.items.map((it) => {
                const q = sel[it._id] ?? 0;
                return (
                  <div key={it._id} className={`flex items-center gap-2 rounded-xl p-2 text-sm ${q ? 'bg-indigo-500/15 ring-1 ring-indigo-400/40' : 'bg-slate-800/50'}`}>
                    <span className="w-6 text-center">{it.emoji || '🍽️'}</span>
                    <span className="min-w-0 flex-1 truncate">{it.name}<span className="block text-xs text-slate-400">{it.qty} × {money(it.price)}</span></span>
                    <button onClick={() => setQty(it, q - 1)} disabled={!q} className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30"><Minus size={14} /></button>
                    <span className="w-10 text-center font-bold tabular-nums">{q}/{it.qty}</span>
                    <button onClick={() => setQty(it, q + 1)} disabled={q >= it.qty} className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30"><Plus size={14} /></button>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">2. Move to card</div>
            <ScanHint text="Tap the other card on the reader" />
            {target && <div className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300">Destination: {target.label}</div>}
            {otherTabs.length > 0 && <div className="mt-4 mb-1.5 text-xs text-slate-400">Open tabs</div>}
            <div className="flex flex-wrap gap-2">
              {otherTabs.map((t) => (
                <button key={t._id} onClick={() => setTarget({ tabId: t._id, label: t.label })} className={`rounded-xl px-3 py-2 text-sm font-semibold ${target?.tabId === t._id ? 'bg-indigo-500 text-on-accent' : 'bg-slate-800 hover:bg-slate-700'}`}>
                  {t.label} <span className="font-normal opacity-75">· {money(tabSubtotal(t))}</span>
                </button>
              ))}
            </div>
            {freeCards.length > 0 && <div className="mt-4 mb-1.5 text-xs text-slate-400">Free cards (opens a new tab)</div>}
            <div className="flex flex-wrap gap-2">
              {freeCards.map((c) => (
                <button key={c._id} onClick={() => setTarget({ uid: c.uid, label: c.label })} className={`rounded-xl px-3 py-2 text-sm font-semibold ${target?.uid === c.uid ? 'bg-indigo-500 text-on-accent' : 'bg-slate-800 hover:bg-slate-700'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Combine: bring another card's whole tab onto this one (e.g. two tables joining). The other card becomes free.
export function MergeTabModal({ tab, open, onClose, tabs, onDone }) {
  const { money } = useSettings();
  const toast = useToast();
  const [from, setFrom] = useState(null);
  const [busy, setBusy] = useState(false);
  const others = useMemo(() => tabs.filter((t) => t._id !== tab?._id), [tabs, tab]);
  useEffect(() => {
    if (open) setFrom(null);
  }, [open]);
  useCardScanner((raw) => {
    const t = others.find((x) => x.cardUid === normUid(raw));
    if (t) setFrom(t);
    else toast('That card has no open tab to combine', 'error');
  }, open);

  const submit = async () => {
    setBusy(true);
    try {
      const updated = await api(`/tabs/${tab._id}/merge`, { method: 'POST', body: { fromTabId: from._id } });
      toast(`${from.label} combined into ${tab.label}`, 'success');
      onDone(updated);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open && !!tab}
      onClose={onClose}
      title={`Combine into ${tab?.label ?? ''}`}
      width="max-w-2xl"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !from} onClick={submit}><Combine size={16} /> {from ? `Combine ${from.label}` : 'Choose a tab'}</button>
        </>
      }
    >
      <ScanHint text="Tap the card to combine, or choose it below" />
      <p className="mt-3 text-sm text-slate-400">All its items and guests move to {tab?.label}, and that card becomes free.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {others.map((t) => (
          <button key={t._id} onClick={() => setFrom(t)} className={`rounded-2xl border p-3 text-left transition ${from?._id === t._id ? 'border-indigo-400 bg-indigo-500/15' : 'border-white/5 bg-slate-800/50 hover:border-white/20'}`}>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: t.color }} /><span className="truncate font-bold">{t.label}</span></div>
            <div className="mt-1 text-lg font-black tabular-nums">{money(tabSubtotal(t))}</div>
            <div className="text-xs text-slate-400">{t.guests} guests · {tabCount(t)} items</div>
          </button>
        ))}
      </div>
      {!others.length && <p className="py-6 text-center text-sm text-slate-500">No other open tabs</p>}
    </Modal>
  );
}
