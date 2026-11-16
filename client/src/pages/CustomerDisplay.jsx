

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, ShoppingBag } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import AnimatedNumber from '../components/AnimatedNumber';
import Clock from '../components/Clock';

const EMPTY_CART = { items: [], subtotal: 0, discount: 0, tax: 0, taxRate: 0, total: 0 };

function PromoCarousel({ promos, storeName, compact }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (promos.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % promos.length), 6000);
    return () => clearInterval(t);
  }, [promos.length]);

  const p = promos[index % Math.max(promos.length, 1)];

  return (
    <div className="relative h-full overflow-hidden rounded-3xl bg-slate-900">
      <AnimatePresence initial={false}>
        {p ? (
          <motion.div
            key={p._id}
            className="absolute inset-0 flex flex-col justify-end p-10"
            style={{ background: `radial-gradient(circle at 75% 25%, ${p.color}70, transparent 55%), linear-gradient(135deg, ${p.color}30, #020617 70%)` }}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          >
            {p.image && <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />}
            <motion.div
              className={`absolute right-[8%] top-[10%] drop-shadow-2xl ${compact ? 'text-[7rem]' : 'text-[12rem]'}`}
              animate={{ y: [0, -18, 0], rotate: [0, 5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              {p.emoji}
            </motion.div>
            <div className="relative">
              <motion.span initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="inline-block rounded-full px-4 py-1 text-sm font-bold uppercase tracking-widest" style={{ background: p.color }}>
                Offer
              </motion.span>
              <motion.h2 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, type: 'spring', stiffness: 120 }} className={`mt-4 font-black leading-tight ${compact ? 'text-4xl' : 'text-6xl'}`}>
                {p.title}
              </motion.h2>
              <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className={`mt-3 max-w-2xl text-slate-200 ${compact ? 'text-xl' : 'text-3xl'}`}>
                {p.message}
              </motion.p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="welcome" className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.3),transparent_60%)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="text-center">
              <motion.div className="text-8xl" animate={{ y: [0, -14, 0] }} transition={{ duration: 3, repeat: Infinity }}>🛒</motion.div>
              <h2 className="mt-6 text-6xl font-black">Welcome to {storeName}</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {promos.length > 1 && (
        <div className="absolute bottom-5 right-6 flex gap-2">
          {promos.map((x, i) => (
            <motion.span key={x._id} animate={{ width: i === index ? 28 : 8, opacity: i === index ? 1 : 0.4 }} className="h-2 rounded-full bg-white" />
          ))}
        </div>
      )}
    </div>
  );
}

function Ticker({ text }) {
  if (!text) return null;
  return (
    <div className="shrink-0 overflow-hidden border-t border-white/5 bg-indigo-600 py-3">
      <div className="flex w-max animate-marquee whitespace-nowrap text-lg font-semibold">
        {[0, 1].map((k) => (
          <span key={k} className="px-12">{text}</span>
        ))}
      </div>
    </div>
  );
}

function OrderPanel({ cart, money }) {
  return (
    <motion.aside
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="flex w-[42%] shrink-0 flex-col rounded-3xl border border-white/5 bg-slate-900"
    >
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-5">
        <ShoppingBag className="text-indigo-400" />
        <h2 className="text-2xl font-bold">Your Order</h2>
        <span className="ml-auto text-slate-400">{cart.items.reduce((s, i) => s + i.qty, 0)} items</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        <AnimatePresence initial={false}>
          {cart.items.map((it) => (
            <motion.div
              key={it.id}
              layout
              initial={{ opacity: 0, x: 60, backgroundColor: 'rgba(99,102,241,0.35)' }}
              animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(30,41,59,0.5)' }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34, backgroundColor: { duration: 1.2 } }}
              className="flex items-center gap-4 rounded-2xl p-3"
            >
              <span className="text-4xl">{it.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-semibold">{it.name}</div>
                <div className="text-slate-400">
                  <motion.span key={it.qty} initial={{ scale: 1.6, color: '#a5b4fc' }} animate={{ scale: 1, color: '#94a3b8' }} className="inline-block font-bold">{it.qty}</motion.span> × {money(it.price)}
                </div>
              </div>
              <div className="text-xl font-bold tabular-nums">{money(it.price * it.qty)}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="space-y-2 border-t border-white/5 px-6 py-5 text-lg">
        <div className="flex justify-between text-slate-400"><span>Subtotal</span><span className="tabular-nums">{money(cart.subtotal)}</span></div>
        {cart.discount > 0 && <div className="flex justify-between text-emerald-400"><span>You save</span><span className="tabular-nums">-{money(cart.discount)}</span></div>}
        <div className="flex justify-between text-slate-400"><span>Tax ({cart.taxRate}%)</span><span className="tabular-nums">{money(cart.tax)}</span></div>
        <div className="flex items-baseline justify-between rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4">
          <span className="text-2xl font-semibold">Total</span>
          <AnimatedNumber value={cart.total} format={money} className="text-5xl font-black tabular-nums" />
        </div>
      </div>
    </motion.aside>
  );
}

export default function CustomerDisplay() {
  const { settings, money } = useSettings();
  const [cart, setCart] = useState(EMPTY_CART);
  const [promos, setPromos] = useState([]);
  const [message, setMessage] = useState(null);
  const [thanks, setThanks] = useState(null);

  useEffect(() => {
    const s = getSocket();
    const loadPromos = () => api('/promotions/active').then(setPromos).catch(() => {});
    const onCart = (d) => setCart({ ...EMPTY_CART, ...d });
    const onSale = (d) => {
      setMessage(null);
      setThanks(d);
    };
    const onMsg = (d) => setMessage(d.text ? { ...d, id: Date.now() } : null);
    const request = () => s.emit('display:request');

    loadPromos();
    s.on('cart:update', onCart);
    s.on('sale:complete', onSale);
    s.on('display:message', onMsg);
    s.on('promotions:update', loadPromos);
    s.on('connect', request);
    if (s.connected) request();
    return () => {
      s.off('cart:update', onCart);
      s.off('sale:complete', onSale);
      s.off('display:message', onMsg);
      s.off('promotions:update', loadPromos);
      s.off('connect', request);
    };
  }, []);

  useEffect(() => {
    if (!thanks) return;
    const t = setTimeout(() => setThanks(null), 7000);
    return () => clearTimeout(t);
  }, [thanks]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), message.duration || 8000);
    return () => clearTimeout(t);
  }, [message]);

  const hasItems = cart.items.length > 0;

  return (
    <motion.div className="relative flex h-full cursor-none flex-col overflow-hidden bg-slate-950" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="flex shrink-0 items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          {settings.logo ? <img src={settings.logo} alt="" className="h-12 w-12 rounded-2xl bg-white object-contain p-1" /> : <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-2xl">🛒</div>}
          <div>
            <div className="text-2xl font-black">{settings.storeName}</div>
            {settings.address && <div className="text-sm text-slate-400">{settings.address}</div>}
            {settings.phone && <div className="text-sm text-slate-400">{settings.phone}</div>}
          </div>
        </div>
        <Clock big className="text-right" />
      </header>

      <div className="flex min-h-0 flex-1 gap-6 px-8 pb-6">
        <motion.section layout transition={{ type: 'spring', stiffness: 200, damping: 30 }} className="min-w-0 flex-1">
          <PromoCarousel promos={promos} storeName={settings.storeName} compact={hasItems} />
        </motion.section>
        <AnimatePresence>{hasItems && <OrderPanel cart={cart} money={money} />}</AnimatePresence>
      </div>

      <Ticker text={settings.ticker} />

      <AnimatePresence>
        {message && (
          <motion.div
            key={message.id}
            initial={{ y: -120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -120, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="absolute inset-x-0 top-6 z-20 mx-auto flex w-fit max-w-[80%] items-center gap-4 rounded-3xl bg-amber-400 px-8 py-5 text-3xl font-bold text-slate-900 shadow-2xl"
          >
            <MessageCircle size={36} />
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {thanks && (
          <motion.div
            className="absolute inset-0 z-30 grid place-items-center bg-[radial-gradient(circle_at_center,#065f46,#020617_70%)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              <motion.svg width="160" height="160" viewBox="0 0 52 52" className="mx-auto" initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
                <motion.circle cx="26" cy="26" r="24" fill="none" stroke="#10b981" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
                <motion.path d="M14 27 l8 8 l16 -16" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.4 }} />
              </motion.svg>
              <motion.h2 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="mt-8 text-7xl font-black">Thank you!</motion.h2>
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8 }} className="mt-6 flex justify-center gap-10 text-2xl">
                <div><div className="text-slate-400">Paid</div><div className="font-bold">{money(thanks.paid)}</div></div>
                {thanks.change > 0 && <div><div className="text-slate-400">Change</div><div className="font-bold text-emerald-400">{money(thanks.change)}</div></div>}
              </motion.div>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-8 text-xl text-slate-300">{settings.receiptFooter}</motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}




