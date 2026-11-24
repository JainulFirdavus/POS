
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, LogOut, MessageSquare, Minus, Monitor, Package, Percent, Plus, Printer, Search, Send, ShoppingBag, Star, Trash2, UtensilsCrossed, Vault, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { round2 } from '../lib/dates';
import Clock from '../components/Clock';
import Modal from '../components/Modal';
import AnimatedNumber from '../components/AnimatedNumber';
import PaymentModal, { METHODS } from '../components/PaymentModal';
import { PrintPortal, ReceiptPaper } from '../components/Receipt';
import { Segmented, onColor } from '../components/ui';
import { MergeTabModal, NoSaleModal, OpenTabModal, SplitTabModal, TabPanel, TabsModal, tabCount, tabSubtotal } from '../components/DineIn';
import { looksLikeCard, normUid, useCardScanner } from '../lib/rfid';

const QUICK_MESSAGES = [
  'Please wait a moment',
  'Please insert or tap your card',
  'Please scan the QR code to pay',
  'Would you like a carry bag?',
  'Thank you for shopping with us!',
];

// Layout options chosen by the admin under Settings → POS Layout.
export const LAYOUT_DEFAULTS = { view: 'grid', tileSize: 'md', menuPosition: 'left', menuSize: 'md', cartWidth: 'md', showStock: true };
const TILE = {
  sm: { min: 112, pad: 'p-2', box: 'mb-2 h-12 text-3xl', name: 'text-xs', price: 'text-sm' },
  md: { min: 150, pad: 'p-3', box: 'mb-3 h-20 text-5xl', name: 'text-sm', price: 'text-base' },
  lg: { min: 190, pad: 'p-3.5', box: 'mb-3 h-28 text-6xl', name: 'text-base', price: 'text-lg' },
  xl: { min: 240, pad: 'p-4', box: 'mb-4 h-36 text-7xl', name: 'text-lg', price: 'text-xl' },
};
const ROW = { sm: 'py-1.5 text-sm', md: 'py-2.5 text-sm', lg: 'py-3.5 text-base', xl: 'py-4 text-lg' };
const ROW_EMOJI = { sm: 'h-7 w-7 text-lg', md: 'h-9 w-9 text-2xl', lg: 'h-11 w-11 text-3xl', xl: 'h-14 w-14 text-4xl' };
const MENU = {
  sm: { rail: 'w-20', emoji: 'text-xl', text: 'text-[10px]', pill: 'gap-1.5 px-3 py-1.5 text-xs', pillEmoji: 'text-base' },
  md: { rail: 'w-24', emoji: 'text-2xl', text: 'text-[11px]', pill: 'gap-2 px-4 py-2 text-sm', pillEmoji: 'text-lg' },
  lg: { rail: 'w-32', emoji: 'text-4xl', text: 'text-sm', pill: 'gap-2 px-5 py-3 text-base', pillEmoji: 'text-2xl' },
};
export const CART_WIDTH = { sm: 'w-[340px]', md: 'w-[400px]', lg: 'w-[480px]' };

function CategoryRail({ categories, active, onChange, position = 'left', size = 'md' }) {
  const items = [{ _id: 'all', name: 'All', emoji: '🏪', color: '#6366f1' }, { _id: 'fav', name: 'Favorites', emoji: '⭐', color: '#f59e0b' }, ...categories];
  const m = MENU[size] ?? MENU.md;
  const pill = (c) =>
    active === c._id && (
      <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-xl" style={{ background: `${c.color}33`, boxShadow: `inset 0 0 0 1px ${c.color}88` }} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
    );
  if (position !== 'left') {
    // Horizontal bar above or below the products; scrolls sideways when there are many categories.
    return (
      <nav className={`flex shrink-0 gap-1.5 overflow-x-auto bg-slate-900/40 p-2 ${position === 'top' ? 'border-b' : 'border-t'} border-white/5`}>
        {items.map((c) => (
          <button
            key={c._id}
            onClick={() => onChange(c._id)}
            className={`relative flex shrink-0 items-center rounded-xl font-semibold transition-colors ${m.pill} ${active === c._id ? 'text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          >
            {pill(c)}
            <span className={`relative ${m.pillEmoji}`}>{c.emoji}</span>
            <span className="relative whitespace-nowrap">{c.name}</span>
          </button>
        ))}
      </nav>
    );
  }
  return (
    <nav className={`flex ${m.rail} shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-white/5 bg-slate-900/40 p-2`}>
      {items.map((c) => (
        <button
          key={c._id}
          onClick={() => onChange(c._id)}
          className={`relative flex flex-col items-center gap-1 rounded-xl px-1 py-3 font-semibold transition-colors ${m.text} ${active === c._id ? 'text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          {pill(c)}
          <span className={`relative ${m.emoji}`}>{c.emoji}</span>
          <span className="relative w-full truncate text-center">{c.name}</span>
        </button>
      ))}
    </nav>
  );
}

function InCartBadge({ qty, className = '' }) {
  return (
    <AnimatePresence>
      {qty > 0 && (
        <motion.span
          key={qty}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 700, damping: 20 }}
          className={`grid h-6 min-w-6 place-items-center rounded-full bg-indigo-500 px-1.5 text-xs font-bold text-on-accent shadow-lg ${className}`}
        >
          {qty}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

const stockLabel = (p) => {
  const out = p.stock <= 0;
  const low = !out && p.stock <= p.lowStock;
  return { out, cls: out ? 'text-rose-400' : low ? 'text-amber-400' : 'text-slate-500', text: out ? 'Out' : `${p.stock} left` };
};

function ProductTile({ p, index, inCart, onAdd, money, size = 'md', showStock = true }) {
  const t = TILE[size] ?? TILE.md;
  const st = stockLabel(p);
  return (
    <button
      onClick={() => onAdd(p)}
      disabled={st.out}
      style={{ animationDelay: `${Math.min(index, 24) * 16}ms`, '--c': p.color }}
      className={`group relative animate-pop-in overflow-hidden rounded-2xl border border-white/5 bg-slate-900 ${t.pad} text-left transition-[translate,scale,border-color] duration-150 hover:-translate-y-0.5 hover:border-[var(--c)] active:scale-95 disabled:opacity-40`}
    >
      <div className={`flex items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 ${t.box}`} style={{ background: `linear-gradient(135deg, ${p.color}40, ${p.color}10)` }}>
        {p.emoji}
      </div>
      <div className={`truncate font-semibold ${t.name}`}>{p.name}</div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className={`ink font-bold ${t.price}`} style={{ '--ink': p.color }}>{money(p.price)}</span>
        {showStock && <span className={`text-[11px] ${st.cls}`}>{st.text}</span>}
      </div>
      {p.favorite && <Star size={14} className="absolute left-2.5 top-2.5 fill-amber-400 text-amber-400" />}
      <InCartBadge qty={inCart} className="absolute right-2 top-2" />
    </button>
  );
}

// Compact one-line rows: fits many more items on screen than tiles (useful for large menus).
function ProductRow({ p, inCart, onAdd, money, size = 'md', showStock = true }) {
  const st = stockLabel(p);
  return (
    <button onClick={() => onAdd(p)} disabled={st.out} className={`flex w-full items-center gap-3 border-b border-white/5 px-3 text-left transition-colors hover:bg-white/5 active:bg-white/10 disabled:opacity-40 ${ROW[size] ?? ROW.md}`}>
      <span className={`grid shrink-0 place-items-center rounded-lg ${ROW_EMOJI[size] ?? ROW_EMOJI.md}`} style={{ background: `${p.color}26` }}>{p.emoji}</span>
      <span className="min-w-0 flex-1 truncate font-semibold">
        {p.favorite && <Star size={12} className="mr-1 inline fill-amber-400 text-amber-400" />}
        {p.name}
      </span>
      {p.sku && <span className="hidden w-24 truncate text-xs text-slate-500 xl:block">{p.sku}</span>}
      {showStock && <span className={`w-16 text-right text-xs ${st.cls}`}>{st.text}</span>}
      <span className="ink w-24 text-right font-bold tabular-nums" style={{ '--ink': p.color }}>{money(p.price)}</span>
      <span className="w-7"><InCartBadge qty={inCart} /></span>
    </button>
  );
}

function CustomItemTile({ onClick, size = 'md' }) {
  const t = TILE[size] ?? TILE.md;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col justify-between rounded-2xl border border-dashed border-indigo-400/50 bg-slate-900 ${t.pad} text-left transition hover:border-indigo-400 hover:bg-slate-800`}
    >
      <div className={`grid place-items-center rounded-xl bg-indigo-500/10 text-indigo-400 transition-transform group-hover:scale-105 ${t.box}`}>
        <Plus size={32} />
      </div>
      <div>
        <div className={`font-semibold ${t.name}`}>Food</div>
        <div className="mt-1 text-xs text-slate-400">Set name and price</div>
      </div>
    </button>
  );
}

function CustomItemRow({ onClick, size = 'md' }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 border-b border-white/5 px-3 text-left text-indigo-300 transition-colors hover:bg-white/5 ${ROW[size] ?? ROW.md}`}>
      <span className={`grid shrink-0 place-items-center rounded-lg bg-indigo-500/10 ${ROW_EMOJI[size] ?? ROW_EMOJI.md}`}><Plus size={18} /></span>
      <span className="flex-1 font-semibold">Food (set name and price)</span>
    </button>
  );
}

function CustomItemModal({ open, onClose, onAdd }) {
  const [name, setName] = useState('Food');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  useEffect(() => {
    if (open) {
      setName('Food');
      setPrice('');
      setStock('');
    }
  }, [open]);

  const amount = Number(price);
  const stockLimit = stock === '' ? null : Number(stock);
  const validStock = stockLimit === null || (Number.isInteger(stockLimit) && stockLimit > 0 && stockLimit <= 10000);
  const valid = name.trim().length > 0 && name.trim().length <= 120 && Number.isFinite(amount) && amount > 0 && amount <= 1000000 && validStock;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Custom Item"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onAdd(name.trim(), Math.round(amount * 100) / 100, stockLimit)}>Add to order</button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Item name</span>
          <input className="input" autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Price</span>
          <input className="input" type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" placeholder="0.00" value={price} onChange={(event) => setPrice(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Stock quantity <span className="normal-case">(optional)</span></span>
          <input className="input" type="number" min="1" max="10000" step="1" inputMode="numeric" placeholder="Unlimited" value={stock} onChange={(event) => setStock(event.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function CartLine({ item, money, onQty }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
      className="flex items-center gap-3 rounded-xl bg-slate-800/40 p-2.5"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-2xl" style={{ background: `${item.color}26` }}>{item.emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{item.name}</div>
        <div className="text-xs text-slate-400">{money(item.price)} each{item.stockLimit != null ? ` · ${item.stockLimit - item.qty} left` : ''}</div>
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-slate-950/60 p-1">
        <button onClick={() => onQty(item.id, item.qty - 1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/10 active:scale-90">
          {item.qty === 1 ? <Trash2 size={14} className="text-rose-400" /> : <Minus size={14} />}
        </button>
        <motion.span key={item.qty} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="w-6 text-center text-sm font-bold tabular-nums">{item.qty}</motion.span>
        <button onClick={() => onQty(item.id, item.qty + 1)} disabled={item.stockLimit != null && item.qty >= item.stockLimit} className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/10 active:scale-90 disabled:opacity-40">
          <Plus size={14} />
        </button>
      </div>
      <div className="w-20 text-right text-sm font-bold tabular-nums">{money(item.price * item.qty)}</div>
    </motion.div>
  );
}

function DiscountModal({ open, onClose, discount, onApply, subtotal, money }) {
  const [type, setType] = useState(discount.type);
  const [value, setValue] = useState(String(discount.value || ''));
  useEffect(() => {
    if (open) {
      setType(discount.type);
      setValue(discount.value ? String(discount.value) : '');
    }
  }, [open, discount]);
  const v = Math.max(0, Number(value) || 0);
  const amount = Math.min(subtotal, type === 'percent' ? (subtotal * Math.min(v, 100)) / 100 : v);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply Discount"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => { onApply({ type, value: 0 }); onClose(); }}>Remove</button>
          <button className="btn btn-primary" onClick={() => { onApply({ type, value: type === 'percent' ? Math.min(v, 100) : v }); onClose(); }}>Apply {money(amount)}</button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
        {[['percent', 'Percent %'], ['amount', 'Fixed amount']].map(([id, label]) => (
          <button key={id} onClick={() => setType(id)} className={`btn ${type === id ? 'btn-primary' : 'btn-ghost'}`}>{label}</button>
        ))}
      </div>
      <input className="input h-14 text-center text-2xl font-bold" type="number" min="0" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
      {type === 'percent' && (
        <div className="mt-3 flex gap-2">
          {[5, 10, 15, 20, 25].map((p) => (
            <button key={p} onClick={() => setValue(String(p))} className="btn btn-ghost flex-1">{p}%</button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function MessageModal({ open, onClose }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const send = (t) => {
    getSocket().emit('display:message', { text: t, duration: 8000 });
    toast('Message sent to customer display', 'success');
    setText('');
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Message to Customer Display">
      <div className="space-y-2">
        {QUICK_MESSAGES.map((m) => (
          <button key={m} onClick={() => send(m)} className="w-full rounded-xl bg-slate-800/60 px-4 py-3 text-left text-sm transition hover:bg-slate-800 active:scale-[0.98]">{m}</button>
        ))}
      </div>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text.trim()); }}>
        <input className="input" placeholder="Custom message..." maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary">Send</button>
      </form>
    </Modal>
  );
}

function ReceiptModal({ invoice, onClose }) {
  const { settings, money } = useSettings();
  const toast = useToast();
  const print = async () => {
    if ((settings.printer?.mode ?? 'browser') === 'browser') return window.print();
    try {
      await api(`/hardware/print/${invoice._id}`, { method: 'POST' });
      toast('Receipt sent to printer', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  useEffect(() => {
    if (!invoice) return;
    const onKey = (e) => e.key === 'Enter' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [invoice, onClose]);
  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      title="Sale Completed"
      width="max-w-md"
      footer={
        <>
          <button className="btn btn-ghost" onClick={print}><Printer size={16} /> {invoice?.hardware?.printed ? 'Reprint' : 'Print'}</button>
          <button className="btn btn-success" onClick={onClose}>New Sale (Enter)</button>
        </>
      }
    >
      {invoice && (
        <>
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }} className="mb-4 text-center">
            <div className="text-4xl">✅</div>
            {invoice.table && <div className="mt-1 text-sm font-semibold text-amber-300">{invoice.table} · tab closed</div>}
            <div className="mt-2 text-sm text-slate-400">Change due</div>
            <div className="text-3xl font-black text-emerald-400">{money(invoice.change)}</div>
          </motion.div>
          <div className="overflow-hidden rounded-xl">
            <ReceiptPaper invoice={invoice} settings={settings} money={money} />
          </div>
          <PrintPortal>
            <ReceiptPaper invoice={invoice} settings={settings} money={money} />
          </PrintPortal>
        </>
      )}
    </Modal>
  );
}


export default function POS() {
  const { user, logout } = useAuth();
  const { settings, money } = useSettings();
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState({ type: 'percent', value: 0 });
  const [payMethod, setPayMethod] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [discOpen, setDiscOpen] = useState(false);
  const [noSaleOpen, setNoSaleOpen] = useState(false);
  const [tab, setTab] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [tabsOpen, setTabsOpen] = useState(false);
  const [newTabCard, setNewTabCard] = useState(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const defaultOrderType = settings.defaultOrderType || 'dine-in';
  const [orderType, setOrderType] = useState(defaultOrderType);
  const layout = { ...LAYOUT_DEFAULTS, ...settings.posLayout };
  const searchRef = useRef(null);
  const displayRef = useRef(null);

  const loadProducts = useCallback(() => api('/products').then(setProducts).catch((e) => toast(e.message, 'error')), [toast]);

  useEffect(() => {
    loadProducts();
    api('/categories').then(setCategories).catch(() => {});
    const s = getSocket();
    s.on('products:changed', loadProducts);
    return () => s.off('products:changed', loadProducts);
  }, [loadProducts]);

  // Open dine-in tabs, kept live across registers. A loaded tab closed elsewhere is dropped.
  const loadTabs = useCallback(
    () =>
      api('/tabs')
        .then((list) => {
          setOpenTabs(list);
          setTab((cur) => cur && (list.find((t) => t._id === cur._id) ?? null));
        })
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    loadTabs();
    const s = getSocket();
    s.on('tabs:changed', loadTabs);
    return () => s.off('tabs:changed', loadTabs);
  }, [loadTabs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (q) return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q);
      return cat === 'all' || (cat === 'fav' ? p.favorite : p.category === cat);
    });
  }, [products, cat, query]);

  const qtyInCart = useMemo(() => Object.fromEntries(cart.map((i) => [i.id, i.qty])), [cart]);

  const totals = useMemo(() => {
    const subtotal = round2(cart.reduce((s, i) => s + i.price * i.qty, 0) + tabSubtotal(tab));
    const disc = round2(Math.min(subtotal, discount.type === 'percent' ? (subtotal * discount.value) / 100 : discount.value));
    const taxRate = settings.taxRate || 0;
    const tax = round2(((subtotal - disc) * taxRate) / 100);
    return { subtotal, discount: disc, tax, taxRate, total: round2(subtotal - disc + tax), count: cart.reduce((s, i) => s + i.qty, 0) + tabCount(tab) };
  }, [cart, discount, settings.taxRate, tab]);
  const canPay = cart.length > 0 || tab?.items.length > 0;

  const add = (p) => {
    const existing = cart.find((i) => i.id === p._id);
    const qty = (existing?.qty || 0) + 1;
    if (qty > p.stock) return toast(p.stock ? `Only ${p.stock} ${p.name} in stock` : `${p.name} is out of stock`, 'error');
    setCart(existing ? cart.map((i) => (i.id === p._id ? { ...i, qty } : i)) : [...cart, { id: p._id, name: p.name, price: p.price, emoji: p.emoji, color: p.color, qty: 1 }]);
  };

  const addCustomItem = (name, price, stockLimit) => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCart((current) => [...current, { id, name, price, emoji: '🍽️', color: '#f59e0b', qty: 1, stockLimit, custom: true }]);
    setCustomItemOpen(false);
  };

  const setQty = (id, qty) => {
    if (qty <= 0) return setCart(cart.filter((i) => i.id !== id));
    const item = cart.find((i) => i.id === id);
    if (item?.custom) {
      if (item.stockLimit != null && qty > item.stockLimit) return toast(`Only ${item.stockLimit} ${item.name} available`, 'error');
      return setCart(cart.map((i) => (i.id === id ? { ...i, qty } : i)));
    }
    const stock = products.find((p) => p._id === id)?.stock ?? 0;
    if (qty > stock) return toast(`Only ${stock} in stock`, 'error');
    setCart(cart.map((i) => (i.id === id ? { ...i, qty } : i)));
  };

  useEffect(() => {
    if (!cart.length) setOrderType(defaultOrderType);
  }, [defaultOrderType]);

  const clearCart = () => {
    setOrderType(defaultOrderType);
    setCart([]);
    setDiscount({ type: 'percent', value: 0 });
  };

  // Mirror the cart to this terminal's customer display.
  useEffect(() => {
    const tabItems = (tab?.items ?? []).map(({ _id, name, price, qty, emoji }) => ({ id: _id, name, price, qty, emoji: emoji || '🍽️' }));
    const state = { items: [...tabItems, ...cart.map(({ id, name, price, qty, emoji }) => ({ id, name, price, qty, emoji }))], ...totals, cashier: user.name };
    displayRef.current = state;
    getSocket().emit('cart:update', state);
  }, [cart, totals, user.name, tab]);

  useEffect(() => {
    const s = getSocket();
    const resend = () => displayRef.current && s.emit('cart:update', displayRef.current);
    s.on('display:request', resend);
    s.on('connect', resend);
    return () => {
      s.off('display:request', resend);
      s.off('connect', resend);
    };
  }, []);

  const cartPayload = () => cart.map((i) => (i.custom ? { custom: true, name: i.name, price: i.price, qty: i.qty } : { productId: i.id, qty: i.qty }));

  // ---- Dine-in tabs (RFID cards) ----
  const handleCard = async (raw) => {
    try {
      const { card, tab: existing } = await api(`/rfid/lookup/${encodeURIComponent(normUid(raw))}`);
      setTabsOpen(false);
      if (existing) {
        setTab(existing);
        toast(`${card.label} loaded`, 'success');
      } else if (!card.active) toast(`${card.label} is disabled`, 'error');
      else setNewTabCard(card);
    } catch (e) {
      toast(e.message === 'This card is not registered' ? 'Card not registered. Add it in Admin → Dine-in & RFID.' : e.message, 'error');
    }
  };

  // Sends the items rung up so far onto the loaded tab.
  const flushCart = async () => {
    if (!cart.length) return tab;
    const updated = await api(`/tabs/${tab._id}/items`, { method: 'POST', body: { items: cartPayload() } });
    setCart([]);
    setTab(updated);
    return updated;
  };

  const sendToTab = async () => {
    try {
      await flushCart();
      toast(`Order sent to ${tab.label}`, 'success');
      setTab(null);
      setDiscount({ type: 'percent', value: 0 });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const cancelTab = async () => {
    try {
      await api(`/tabs/${tab._id}/cancel`, { method: 'POST' });
      setTab(null);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const startPayment = async (method) => {
    if (!canPay) return;
    if (tab) {
      try {
        await flushCart();
      } catch (e) {
        return toast(e.message, 'error');
      }
    }
    setPayMethod(method);
  };

  const completeSale = async (method, paid) => {
    try {
      const body = { discount: totals.discount, paymentMethod: method, paid };
      const inv = tab
        ? await api(`/tabs/${tab._id}/checkout`, { method: 'POST', body })
        : await api('/invoices', { method: 'POST', body: { items: cartPayload(), orderType, ...body } });
      getSocket().emit('sale:complete', { number: inv.number, total: inv.total, paid: inv.paid, change: inv.change, method });
      clearCart();
      setTab(null);
      setPayMethod(null);
      setReceipt(inv);
      toast(`Sale ${inv.number} completed`, 'success');
      if (inv.hardware?.error) toast(`Printer / drawer: ${inv.hardware.error}`, 'error');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const anyModal = payMethod || receipt || customItemOpen || msgOpen || discOpen || noSaleOpen || newTabCard || tabsOpen || splitOpen || mergeOpen;
  useCardScanner(handleCard, !(payMethod || receipt || customItemOpen || msgOpen || discOpen || noSaleOpen || newTabCard || splitOpen || mergeOpen));
  useEffect(() => {
    const onKey = (e) => {
      if (anyModal) return;
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F4' && canPay) {
        e.preventDefault();
        startPayment('cash');
      } else if (e.key === 'F8') {
        e.preventDefault();
        clearCart();
      } else if (e.key === 'F9') {
        e.preventDefault();
        setMsgOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Barcode scanners type the code and press Enter.
  const onSearchKey = (e) => {
    if (e.key === 'Escape') return setQuery('');
    if (e.key !== 'Enter') return;
    const q = query.trim();
    if (!q) return;
    const exact = products.find((p) => p.barcode === q || p.sku?.toLowerCase() === q.toLowerCase());
    const target = exact || (filtered.length === 1 ? filtered[0] : null);
    if (target) {
      add(target);
      setQuery('');
    } else if (looksLikeCard(q)) {
      // An RFID reader typing into the search box.
      setQuery('');
      handleCard(q);
    } else toast('No exact match found', 'error');
  };

  const catName = query ? `Results for "${query}"` : cat === 'all' ? 'All Products' : cat === 'fav' ? 'Favorites' : categories.find((c) => c._id === cat)?.name;

  return (
    <motion.div data-theme={settings.sellerTheme || 'midnight'} className="pos-themed flex h-full flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-white/5 bg-slate-900/60 px-4">
        <div className="flex items-center gap-2.5">
          {settings.logo ? <img src={settings.logo} alt="" className="h-9 w-9 rounded-xl bg-paper object-contain p-1" /> : <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-lg">🛒</div>}
          <span className="hidden font-bold lg:block">{settings.storeName}</span>
        </div>
        <div className="relative max-w-xl flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search product, SKU or scan barcode..."
            className="input h-11 pl-11 pr-14"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">F2</kbd>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Clock className="mr-2 hidden text-right md:block" />
          <button title="Dine-in tabs (tap an RFID card)" onClick={() => setTabsOpen(true)} className="btn btn-ghost relative px-3">
            <UtensilsCrossed size={18} /> <span className="hidden xl:inline">Dine-in</span>
            {openTabs.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-amber-950">{openTabs.length}</span>}
          </button>
          <button title="Open cash drawer (No sale)" onClick={() => setNoSaleOpen(true)} className="btn btn-ghost px-3"><Vault size={18} /></button>
          <button title="Message customer (F9)" onClick={() => setMsgOpen(true)} className="btn btn-ghost px-3"><MessageSquare size={18} /></button>
          <button title="Open customer display" onClick={() => window.open('#/customer', 'customer-display', 'popup,noopener,width=1280,height=720')} className="btn btn-ghost px-3"><Monitor size={18} /></button>
          {user.role === 'admin' && <Link to="/admin" className="btn btn-ghost px-3" title="Admin"><LayoutDashboard size={18} /></Link>}
          <div className="flex items-center gap-2 rounded-xl bg-white/5 py-1.5 pl-1.5 pr-3">
            <div className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold" style={{ background: user.color || '#059669', color: onColor(user.color || '#059669') }}>{user.name[0]}</div>
            <span className="text-sm font-medium">{user.name}</span>
          </div>
          <button title="Logout" onClick={logout} className="btn btn-danger px-3"><LogOut size={18} /></button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {layout.menuPosition === 'left' && <CategoryRail categories={categories} active={query ? null : cat} onChange={(id) => { setCat(id); setQuery(''); }} size={layout.menuSize} />}

        <div className="flex min-w-0 flex-1 flex-col">
          {layout.menuPosition === 'top' && <CategoryRail position="top" size={layout.menuSize} categories={categories} active={query ? null : cat} onChange={(id) => { setCat(id); setQuery(''); }} />}
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">{catName}</h2>
              <span className="text-xs text-slate-500">{filtered.length} items</span>
            </div>
            {layout.view === 'list' ? (
              <div key={query ? 'search' : cat} className="overflow-hidden rounded-2xl border border-white/5 bg-slate-900">
                <CustomItemRow size={layout.tileSize} onClick={() => setCustomItemOpen(true)} />
                {filtered.map((p) => (
                  <ProductRow key={p._id} p={p} inCart={qtyInCart[p._id] || 0} onAdd={add} money={money} size={layout.tileSize} showStock={layout.showStock} />
                ))}
              </div>
            ) : (
              <div key={query ? 'search' : cat} className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${(TILE[layout.tileSize] ?? TILE.md).min}px, 1fr))` }}>
                <CustomItemTile size={layout.tileSize} onClick={() => setCustomItemOpen(true)} />
                {filtered.map((p, i) => (
                  <ProductTile key={p._id} p={p} index={i + 1} inCart={qtyInCart[p._id] || 0} onAdd={add} money={money} size={layout.tileSize} showStock={layout.showStock} />
                ))}
              </div>
            )}
            {!filtered.length && (
              <div className="flex flex-col items-center gap-3 py-20 text-slate-500">
                <Package size={40} strokeWidth={1.5} />
                No products found
              </div>
            )}
          </main>
          {layout.menuPosition === 'bottom' && <CategoryRail position="bottom" size={layout.menuSize} categories={categories} active={query ? null : cat} onChange={(id) => { setCat(id); setQuery(''); }} />}
        </div>

        <aside className={`flex ${CART_WIDTH[layout.cartWidth] ?? CART_WIDTH.md} shrink-0 flex-col border-l border-white/5 bg-slate-900/50`}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{tab ? 'New items' : 'Current Order'}</h2>
              <motion.span key={totals.count} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-bold text-indigo-300">{totals.count}</motion.span>
            </div>
            <button onClick={clearCart} disabled={!cart.length} className="btn btn-danger px-3 py-1.5 text-xs"><X size={14} /> Clear (F8)</button>
          </div>
          {!tab && (
            <div className="px-4 pb-3 [&>div]:flex [&>div]:w-full [&_button]:flex-1">
              <Segmented id="order-type" value={orderType} onChange={setOrderType} options={[{ value: 'dine-in', label: '🍽️ Dine-in' }, { value: 'takeaway', label: '🥡 Takeaway' }]} />
            </div>
          )}

          {tab && <TabPanel tab={tab} onExit={() => { setTab(null); setDiscount({ type: 'percent', value: 0 }); }} onCancel={cancelTab} onTabChange={setTab} onSplit={() => setSplitOpen(true)} onMerge={() => setMergeOpen(true)} canMerge={openTabs.some((t) => t._id !== tab._id)} />}
          <div className="flex-1 space-y-2 overflow-y-auto px-3">
            <AnimatePresence initial={false}>
              {cart.map((item) => <CartLine key={item.id} item={item} money={money} onQty={setQty} />)}
            </AnimatePresence>
            {!cart.length && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
                  <ShoppingBag size={48} strokeWidth={1.3} />
                </motion.div>
                <p className="text-sm">{tab ? `Tap products to add to ${tab.label}` : 'Tap a product, or tap a dine-in card'}</p>
              </motion.div>
            )}
          </div>

          <div className="space-y-2 border-t border-white/5 p-4">
            <div className="flex justify-between text-sm text-slate-400"><span>Subtotal</span><span className="tabular-nums text-slate-200">{money(totals.subtotal)}</span></div>
            <button onClick={() => setDiscOpen(true)} disabled={!canPay} className="flex w-full items-center justify-between text-sm text-slate-400 hover:text-white disabled:opacity-50">
              <span className="flex items-center gap-1.5"><Percent size={14} /> Discount {discount.value > 0 && discount.type === 'percent' ? `(${discount.value}%)` : ''}</span>
              <span className="tabular-nums text-rose-300">-{money(totals.discount)}</span>
            </button>
            {totals.taxRate > 0 && <div className="flex justify-between text-sm text-slate-400"><span>{settings.taxLabel || 'Tax'} ({totals.taxRate}%)</span><span className="tabular-nums text-slate-200">{money(totals.tax)}</span></div>}
            <div className="flex items-baseline justify-between border-t border-dashed border-white/10 pt-3">
              <span className="text-lg font-semibold">Total</span>
              <AnimatedNumber value={totals.total} format={money} className="text-3xl font-black tabular-nums" />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              {METHODS.map((m) => (
                <button key={m.id} disabled={!canPay} onClick={() => startPayment(m.id)} className="btn flex-col gap-1 bg-slate-800 py-3 text-xs hover:bg-slate-700">
                  <m.icon size={20} style={{ color: m.color }} />
                  {m.label}
                </button>
              ))}
            </div>
            {tab ? (
              <div className="grid grid-cols-2 gap-2">
                <button disabled={!cart.length} onClick={sendToTab} className="btn h-14 bg-amber-500 text-base text-amber-950 hover:brightness-110">
                  <Send size={18} /> Send to tab
                </button>
                <button disabled={!canPay} onClick={() => startPayment('cash')} className="btn btn-success h-14 text-base">
                  Pay & close {money(totals.total)}
                </button>
              </div>
            ) : (
              <button disabled={!canPay} onClick={() => startPayment('cash')} className="btn btn-success h-14 w-full text-lg">
                Pay {money(totals.total)} <kbd className="rounded bg-black/20 px-1.5 text-xs">F4</kbd>
              </button>
            )}
          </div>
        </aside>
      </div>

      <PaymentModal open={!!payMethod} initialMethod={payMethod || 'cash'} total={totals.total} onClose={() => setPayMethod(null)} onComplete={completeSale} />
      <ReceiptModal invoice={receipt} onClose={() => setReceipt(null)} />
      <CustomItemModal open={customItemOpen} onClose={() => setCustomItemOpen(false)} onAdd={addCustomItem} />
      <MessageModal open={msgOpen} onClose={() => setMsgOpen(false)} />
      <TabsModal open={tabsOpen} onClose={() => setTabsOpen(false)} tabs={openTabs} onSelect={(t) => { setTab(t); setTabsOpen(false); }} />
      <OpenTabModal card={newTabCard} onClose={() => setNewTabCard(null)} onOpened={(t) => { setTab(t); setNewTabCard(null); toast(`${t.label} tab opened`, 'success'); }} />
      <NoSaleModal open={noSaleOpen} onClose={() => setNoSaleOpen(false)} />
      <SplitTabModal open={splitOpen} tab={tab} tabs={openTabs} onClose={() => setSplitOpen(false)} onDone={(r) => { setTab(r.source.status === 'open' ? r.source : r.target); setSplitOpen(false); }} />
      <MergeTabModal open={mergeOpen} tab={tab} tabs={openTabs} onClose={() => setMergeOpen(false)} onDone={(t) => { setTab(t); setMergeOpen(false); }} />
      <DiscountModal open={discOpen} onClose={() => setDiscOpen(false)} discount={discount} onApply={setDiscount} subtotal={totals.subtotal} money={money} />
    </motion.div>
  );
}



