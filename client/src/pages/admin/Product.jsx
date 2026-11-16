

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Boxes, PackagePlus, Pencil, Plus, Search, Star, Tags, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import { ColorPicker, Empty, Field, PageHeader, Segmented, Toggle } from '../../components/ui';

const EMOJIS = ['📦', '☕', '🍵', '🥤', '🧋', '🥐', '🍰', '🍩', '🍔', '🍕', '🌭', '🍟', '🍿', '🍫', '🍨', '🍎', '🥛', '🧀', '🍞', '🥗'];
const EMPTY_PRODUCT = { name: '', sku: '', barcode: '', category: '', price: '', cost: '', stock: '', lowStock: 5, emoji: '📦', color: '#6366f1', favorite: false, active: true };
const EMPTY_CAT = { name: '', emoji: '🛒', color: '#6366f1', order: 0 };

function EmojiPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => onChange(e)} className={`grid h-9 w-9 place-items-center rounded-lg text-xl transition active:scale-90 ${value === e ? 'bg-indigo-500/30 ring-1 ring-indigo-400' : 'bg-slate-800 hover:bg-slate-700'}`}>
          {e}
        </button>
      ))}
      <input className="input h-9 w-16 text-center" value={value} maxLength={4} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ProductForm({ open, onClose, product, categories, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(EMPTY_PRODUCT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setF(product ? { ...EMPTY_PRODUCT, ...product, category: product.category || '' } : EMPTY_PRODUCT);
  }, [open, product]);

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, price: Number(f.price), cost: Number(f.cost || 0), stock: Number(f.stock || 0), lowStock: Number(f.lowStock || 0) };
      if (product) await api(`/products/${product._id}`, { method: 'PUT', body });
      else await api('/products', { method: 'POST', body });
      toast(product ? 'Product updated' : 'Product added', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Edit Product' : 'New Product'}
      width="max-w-2xl"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" form="product-form" disabled={busy}>{busy ? 'Saving...' : 'Save product'}</button>
        </>
      }
    >
      <form id="product-form" onSubmit={save} className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2"><input className="input" required value={f.name} onChange={set('name')} /></Field>
        <Field label="SKU"><input className="input" value={f.sku || ''} onChange={set('sku')} /></Field>
        <Field label="Barcode"><input className="input" value={f.barcode || ''} onChange={set('barcode')} /></Field>
        <Field label="Category">
          <select className="input" value={f.category} onChange={set('category')}>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c._id} value={c._id}>{c.emoji} {c.name}</option>)}
          </select>
        </Field>
        <Field label="Selling price"><input className="input" type="number" step="0.01" min="0" required value={f.price} onChange={set('price')} /></Field>
        <Field label="Cost price"><input className="input" type="number" step="0.01" min="0" value={f.cost} onChange={set('cost')} /></Field>
        <Field label="Stock qty"><input className="input" type="number" step="1" value={f.stock} onChange={set('stock')} /></Field>
        <Field label="Low stock alert at"><input className="input" type="number" step="1" min="0" value={f.lowStock} onChange={set('lowStock')} /></Field>
        <div className="flex items-end gap-6 pb-2">
          <Toggle checked={f.favorite} onChange={set('favorite')} label="Quick access" />
          <Toggle checked={f.active} onChange={set('active')} label="Active" />
        </div>
        <Field label="Icon" className="col-span-2"><EmojiPicker value={f.emoji} onChange={set('emoji')} /></Field>
        <Field label="Tile color" className="col-span-2"><ColorPicker value={f.color} onChange={set('color')} /></Field>
      </form>
    </Modal>
  );
}

function StockModal({ product, onClose, onSaved }) {
  const toast = useToast();
  const [qty, setQty] = useState('');
  useEffect(() => setQty(''), [product]);
  const apply = async (sign) => {
    const n = Math.abs(Math.trunc(Number(qty)));
    if (!n) return toast('Enter a quantity', 'error');
    try {
      await api(`/products/${product._id}/stock`, { method: 'PATCH', body: { adjust: sign * n } });
      toast(`Stock ${sign > 0 ? 'added' : 'removed'}`, 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <Modal open={!!product} onClose={onClose} title={`Adjust stock · ${product?.name ?? ''}`} width="max-w-sm">
      <div className="mb-4 text-center">
        <div className="text-sm text-slate-400">Current stock</div>
        <div className="text-4xl font-black">{product?.stock}</div>
      </div>
      <input className="input h-14 text-center text-2xl font-bold" type="number" min="1" autoFocus placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn btn-danger h-12" onClick={() => apply(-1)}>− Remove</button>
        <button className="btn btn-success h-12" onClick={() => apply(1)}>+ Add stock</button>
      </div>
    </Modal>
  );
}

function CategoryForm({ open, onClose, category, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(EMPTY_CAT);
  useEffect(() => {
    if (open) setF(category ? { ...EMPTY_CAT, ...category } : EMPTY_CAT);
  }, [open, category]);
  const save = async (e) => {
    e.preventDefault();
    try {
      if (category) await api(`/categories/${category._id}`, { method: 'PUT', body: { ...f, order: Number(f.order) || 0 } });
      else await api('/categories', { method: 'POST', body: { ...f, order: Number(f.order) || 0 } });
      toast('Category saved', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={category ? 'Edit Category' : 'New Category'} footer={<button className="btn btn-primary" form="cat-form">Save</button>}>
      <form id="cat-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Name" className="col-span-2"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Sort order"><input className="input" type="number" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} /></Field>
        </div>
        <Field label="Icon"><EmojiPicker value={f.emoji} onChange={(emoji) => setF({ ...f, emoji })} /></Field>
        <Field label="Color"><ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
      </form>
    </Modal>
  );
}

export default function Products() {
  const { money } = useSettings();
  const toast = useToast();
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [stockFor, setStockFor] = useState(null);
  const [catEditing, setCatEditing] = useState(null);

  const load = useCallback(() => {
    api('/products?all=1').then(setProducts).catch((e) => toast(e.message, 'error'));
    api('/categories').then(setCategories).catch(() => {});
  }, [toast]);
  useEffect(load, [load]);

  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c._id, c])), [categories]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (!catFilter || p.category === catFilter) && (!q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q)));
  }, [products, query, catFilter]);

  const remove = async (path, label) => {
    if (!window.confirm(`Delete ${label}?`)) return;
    try {
      await api(path, { method: 'DELETE' });
      toast('Deleted', 'success');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader title="Products & Stock" subtitle={`${products.length} products · ${categories.length} categories`}>
        <Segmented id="prod-tab" value={tab} onChange={setTab} options={[{ value: 'products', label: 'Products' }, { value: 'categories', label: 'Categories' }]} />
        {tab === 'products' ? (
          <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add product</button>
        ) : (
          <button className="btn btn-primary" onClick={() => setCatEditing({})}><Plus size={16} /> Add category</button>
        )}
      </PageHeader>

      <AnimatePresence mode="wait">
        {tab === 'products' ? (
          <motion.div key="p" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="mb-4 flex flex-wrap gap-3">
              <div className="relative min-w-64 flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="input pl-10" placeholder="Search name, SKU, barcode..." value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="input w-56" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c._id} value={c._id}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-white/5 bg-slate-900">
                  <tr><th className="th">Product</th><th className="th">Category</th><th className="th text-right">Price</th><th className="th text-right">Cost</th><th className="th text-center">Stock</th><th className="th">Status</th><th className="th" /></tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => {
                    const low = p.stock <= p.lowStock;
                    return (
                      <tr key={p._id} className="animate-pop-in border-b border-white/5 transition-colors hover:bg-white/[0.02]" style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}>
                        <td className="td">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-lg text-xl" style={{ background: `${p.color}26` }}>{p.emoji}</div>
                            <div>
                              <div className="flex items-center gap-1.5 font-medium">{p.name}{p.favorite && <Star size={12} className="fill-amber-400 text-amber-400" />}</div>
                              <div className="text-xs text-slate-500">{p.sku}{p.barcode && ` · ${p.barcode}`}</div>
                            </div>
                          </div>
                        </td>
                        <td className="td text-slate-400">{catById[p.category] ? `${catById[p.category].emoji} ${catById[p.category].name}` : '—'}</td>
                        <td className="td text-right font-semibold">{money(p.price)}</td>
                        <td className="td text-right text-slate-400">{money(p.cost)}</td>
                        <td className="td text-center">
                          <button onClick={() => setStockFor(p)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition hover:ring-1 hover:ring-white/20 ${p.stock <= 0 ? 'bg-rose-500/20 text-rose-300' : low ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                            <PackagePlus size={13} /> {p.stock}
                          </button>
                        </td>
                        <td className="td"><span className={`text-xs ${p.active ? 'text-emerald-400' : 'text-slate-500'}`}>{p.active ? 'Active' : 'Hidden'}</span></td>
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setEditing(p)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil size={16} /></button>
                            <button onClick={() => remove(`/products/${p._id}`, p.name)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filtered.length && <Empty icon={Boxes} text="No products found" />}
            </div>
          </motion.div>
        ) : (
          <motion.div key="c" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {categories.map((c, i) => (
              <motion.div key={c._id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className="card group relative overflow-hidden p-5">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-25" style={{ background: c.color }} />
                <div className="text-4xl">{c.emoji}</div>
                <div className="mt-3 font-semibold">{c.name}</div>
                <div className="text-xs text-slate-500">{products.filter((p) => p.category === c._id).length} products</div>
                <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => setCatEditing(c)} className="rounded-lg bg-slate-900/80 p-1.5 hover:text-white"><Pencil size={14} /></button>
                  <button onClick={() => remove(`/categories/${c._id}`, c.name)} className="rounded-lg bg-slate-900/80 p-1.5 hover:text-rose-400"><Trash2 size={14} /></button>
                </div>
              </motion.div>
            ))}
            {!categories.length && <div className="col-span-full"><Empty icon={Tags} text="No categories yet" /></div>}
          </motion.div>
        )}
      </AnimatePresence>

      <ProductForm open={!!editing} product={editing?._id ? editing : null} categories={categories} onClose={() => setEditing(null)} onSaved={load} />
      <StockModal product={stockFor} onClose={() => setStockFor(null)} onSaved={load} />
      <CategoryForm open={!!catEditing} category={catEditing?._id ? catEditing : null} onClose={() => setCatEditing(null)} onSaved={load} />
    </>
  );
} 