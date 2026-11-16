
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, LogOut, MessageSquare, Minus, Monitor, Package, Percent, Plus, Printer, Search, ShoppingBag, Star, Trash2, X,
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

const QUICK_MESSAGES = [
  'Please wait a moment',
  'Please insert or tap your card',
  'Please scan the QR code to pay',
  'Would you like a carry bag?',
  'Thank you for shopping with us!',
];

function CategoryRail({ categories, active, onChange }) {
  const items = [{ _id: 'all', name: 'All', emoji: '🏪', color: '#6366f1' }, { _id: 'fav', name: 'Favorites', emoji: '⭐', color: '#f59e0b' }, ...categories];
  return (
    <nav className="flex w-24 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-white/5 bg-slate-900/40 p-2">
      {items.map((c) => (
        <button
          key={c._id}
          onClick={() => onChange(c._id)}
          className={`relative flex flex-col items-center gap-1 rounded-xl px-1 py-3 text-[11px] font-semibold transition-colors ${active === c._id ? 'text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          {active === c._id && (
            <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-xl" style={{ background: `${c.color}33`, boxShadow: `inset 0 0 0 1px ${c.color}88` }} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <span className="relative text-2xl">{c.emoji}</span>
          <span className="relative w-full truncate text-center">{c.name}</span>
        </button>
      ))}
    </nav>
  );
}

function ProductTile({ p, index, inCart, onAdd, money }) {
  const out = p.stock <= 0;
  const low = !out && p.stock <= p.lowStock;
  return (
    <button
      onClick={() => onAdd(p)}
      disabled={out}
      style={{ animationDelay: `${Math.min(index, 24) * 16}ms`, '--c': p.color }}
      className="group relative animate-pop-in overflow-hidden rounded-2xl border border-white/5 bg-slate-900 p-3 text-left transition-[translate,scale,border-color] duration-150 hover:-translate-y-0.5 hover:border-[var(--c)] active:scale-95 disabled:opacity-40"
    >
      <div
        className="mb-3 flex h-20 items-center justify-center rounded-xl text-5xl transition-transform duration-200 group-hover:scale-110"
        style={{ background: `linear-gradient(135deg, ${p.color}40, ${p.color}10)` }}
      >
        {p.emoji}
      </div>
      <div className="truncate text-sm font-semibold">{p.name}</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-bold" style={{ color: p.color }}>{money(p.price)}</span>
        <span className={`text-[11px] ${out ? 'text-rose-400' : low ? 'text-amber-400' : 'text-slate-500'}`}>{out ? 'Out' : `${p.stock} left`}</span>
      </div>
      {p.favorite && <Star size={14} className="absolute left-2.5 top-2.5 fill-amber-400 text-amber-400" />}
      <AnimatePresence>
        {inCart > 0 && (
          <motion.span
            key={inCart}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 700, damping: 20 }}
            className="absolute right-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-indigo-500 px-1.5 text-xs font-bold shadow-lg"
          >
            {inCart}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function CustomItemTile({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-36 flex-col justify-between rounded-2xl border border-dashed border-indigo-400/50 bg-slate-900 p-3 text-left transition hover:border-indigo-400 hover:bg-slate-800"
    >
      <div className="grid h-20 place-items-center rounded-xl bg-indigo-500/10 text-indigo-400 transition-transform group-hover:scale-105">
        <Plus size={32} />
      </div>
      <div className="mt-3">
        <div className="text-sm font-semibold">Food</div>
        <div className="mt-1 text-xs text-slate-400">Set name and price</div>
      </div>
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
          <button className="btn btn-ghost" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button className="btn btn-success" onClick={onClose}>New Sale (Enter)</button>
        </>
      }
    >
      {invoice && (
        <>
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }} className="mb-4 text-center">
            <div className="text-4xl">✅</div>
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (q) return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q);
      return cat === 'all' || (cat === 'fav' ? p.favorite : p.category === cat);
    });
  }, [products, cat, query]);

  const qtyInCart = useMemo(() => Object.fromEntries(cart.map((i) => [i.id, i.qty])), [cart]);

  const totals = useMemo(() => {
    const subtotal = round2(cart.reduce((s, i) => s + i.price * i.qty, 0));
    const disc = round2(Math.min(subtotal, discount.type === 'percent' ? (subtotal * discount.value) / 100 : discount.value));
    const taxRate = settings.taxRate || 0;
    const tax = round2(((subtotal - disc) * taxRate) / 100);
    return { subtotal, discount: disc, tax, taxRate, total: round2(subtotal - disc + tax), count: cart.reduce((s, i) => s + i.qty, 0) };
  }, [cart, discount, settings.taxRate]);

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

  const clearCart = () => {
    setCart([]);
    setDiscount({ type: 'percent', value: 0 });
  };

  // Mirror the cart to this terminal's customer display.
  useEffect(() => {
    const state = { items: cart.map(({ id, name, price, qty, emoji }) => ({ id, name, price, qty, emoji })), ...totals, cashier: user.name };
    displayRef.current = state;
    getSocket().emit('cart:update', state);
  }, [cart, totals, user.name]);

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

  const completeSale = async (method, paid) => {
    try {
      const inv = await api('/invoices', {
        method: 'POST',
        body: { items: cart.map((i) => (i.custom ? { custom: true, name: i.name, price: i.price, qty: i.qty } : { productId: i.id, qty: i.qty })), discount: totals.discount, paymentMethod: method, paid },
      });
      getSocket().emit('sale:complete', { number: inv.number, total: inv.total, paid: inv.paid, change: inv.change, method });
      clearCart();
      setPayMethod(null);
      setReceipt(inv);
      toast(`Sale ${inv.number} completed`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const anyModal = payMethod || receipt || customItemOpen || msgOpen || discOpen;
  useEffect(() => {
    const onKey = (e) => {
      if (anyModal) return;
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F4' && cart.length) {
        e.preventDefault();
        setPayMethod('cash');
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
    } else toast('No exact match found', 'error');
  };

  const catName = query ? `Results for "${query}"` : cat === 'all' ? 'All Products' : cat === 'fav' ? 'Favorites' : categories.find((c) => c._id === cat)?.name;

  return (
    <motion.div data-theme={settings.sellerTheme || 'midnight'} className="pos-themed flex h-full flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-white/5 bg-slate-900/60 px-4">
        <div className="flex items-center gap-2.5">
          {settings.logo ? <img src={settings.logo} alt="" className="h-9 w-9 rounded-xl bg-white object-contain p-1" /> : <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-lg">🛒</div>}
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
          <button title="Message customer (F9)" onClick={() => setMsgOpen(true)} className="btn btn-ghost px-3"><MessageSquare size={18} /></button>
          <button title="Open customer display" onClick={() => window.open('#/customer', 'customer-display', 'popup,noopener,width=1280,height=720')} className="btn btn-ghost px-3"><Monitor size={18} /></button>
          {user.role === 'admin' && <Link to="/admin" className="btn btn-ghost px-3" title="Admin"><LayoutDashboard size={18} /></Link>}
          <div className="flex items-center gap-2 rounded-xl bg-white/5 py-1.5 pl-1.5 pr-3">
            <div className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold" style={{ background: user.color || '#10b981' }}>{user.name[0]}</div>
            <span className="text-sm font-medium">{user.name}</span>
          </div>
          <button title="Logout" onClick={logout} className="btn btn-danger px-3"><LogOut size={18} /></button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <CategoryRail categories={categories} active={query ? null : cat} onChange={(id) => { setCat(id); setQuery(''); }} />

        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">{catName}</h2>
            <span className="text-xs text-slate-500">{filtered.length} items</span>
          </div>
          <div key={query ? 'search' : cat} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            <CustomItemTile onClick={() => setCustomItemOpen(true)} />
            {filtered.map((p, i) => (
              <ProductTile key={p._id} p={p} index={i + 1} inCart={qtyInCart[p._id] || 0} onAdd={add} money={money} />
            ))}
          </div>
          {!filtered.length && (
            <div className="flex flex-col items-center gap-3 py-20 text-slate-500">
              <Package size={40} strokeWidth={1.5} />
              No products found
            </div>
          )}
        </main>

        <aside className="flex w-[400px] shrink-0 flex-col border-l border-white/5 bg-slate-900/50">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Current Order</h2>
              <motion.span key={totals.count} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-bold text-indigo-300">{totals.count}</motion.span>
            </div>
            <button onClick={clearCart} disabled={!cart.length} className="btn btn-danger px-3 py-1.5 text-xs"><X size={14} /> Clear (F8)</button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3">
            <AnimatePresence initial={false}>
              {cart.map((item) => <CartLine key={item.id} item={item} money={money} onQty={setQty} />)}
            </AnimatePresence>
            {!cart.length && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
                  <ShoppingBag size={48} strokeWidth={1.3} />
                </motion.div>
                <p className="text-sm">Tap a product to start an order</p>
              </motion.div>
            )}
          </div>

          <div className="space-y-2 border-t border-white/5 p-4">
            <div className="flex justify-between text-sm text-slate-400"><span>Subtotal</span><span className="tabular-nums text-slate-200">{money(totals.subtotal)}</span></div>
            <button onClick={() => setDiscOpen(true)} disabled={!cart.length} className="flex w-full items-center justify-between text-sm text-slate-400 hover:text-white disabled:opacity-50">
              <span className="flex items-center gap-1.5"><Percent size={14} /> Discount {discount.value > 0 && discount.type === 'percent' ? `(${discount.value}%)` : ''}</span>
              <span className="tabular-nums text-rose-300">-{money(totals.discount)}</span>
            </button>
            <div className="flex justify-between text-sm text-slate-400"><span>Tax ({totals.taxRate}%)</span><span className="tabular-nums text-slate-200">{money(totals.tax)}</span></div>
            <div className="flex items-baseline justify-between border-t border-dashed border-white/10 pt-3">
              <span className="text-lg font-semibold">Total</span>
              <AnimatedNumber value={totals.total} format={money} className="text-3xl font-black tabular-nums" />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              {METHODS.map((m) => (
                <button key={m.id} disabled={!cart.length} onClick={() => setPayMethod(m.id)} className="btn flex-col gap-1 bg-slate-800 py-3 text-xs hover:bg-slate-700">
                  <m.icon size={20} style={{ color: m.color }} />
                  {m.label}
                </button>
              ))}
            </div>
            <button disabled={!cart.length} onClick={() => setPayMethod('cash')} className="btn btn-success h-14 w-full text-lg">
              Pay {money(totals.total)} <kbd className="rounded bg-black/20 px-1.5 text-xs">F4</kbd>
            </button>
          </div>
        </aside>
      </div>

      <PaymentModal open={!!payMethod} initialMethod={payMethod || 'cash'} total={totals.total} onClose={() => setPayMethod(null)} onComplete={completeSale} />
      <ReceiptModal invoice={receipt} onClose={() => setReceipt(null)} />
      <CustomItemModal open={customItemOpen} onClose={() => setCustomItemOpen(false)} onAdd={addCustomItem} />
      <MessageModal open={msgOpen} onClose={() => setMsgOpen(false)} />
      <DiscountModal open={discOpen} onClose={() => setDiscOpen(false)} discount={discount} onApply={setDiscount} subtotal={totals.subtotal} money={money} />
    </motion.div>
  );
}



