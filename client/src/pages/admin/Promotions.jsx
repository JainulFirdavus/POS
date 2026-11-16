


import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus, Megaphone, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { toInputDate } from '../../lib/dates';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import { ColorPicker, Empty, Field, PageHeader, Toggle } from '../../components/ui';

const EMPTY = { title: '', message: '', emoji: '🎉', color: '#8b5cf6', image: '', active: true, startDate: '', endDate: '', order: 0 };

function PromoForm({ open, promo, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  useEffect(() => {
    if (!open) return;
    setF(
      promo
        ? { ...EMPTY, ...promo, image: promo.image || '', startDate: promo.startDate ? toInputDate(new Date(promo.startDate)) : '', endDate: promo.endDate ? toInputDate(new Date(promo.endDate)) : '' }
        : EMPTY,
    );
  }, [open, promo]);

  const save = async (e) => {
    e.preventDefault();
    const body = {
      ...f,
      order: Number(f.order) || 0,
      startDate: f.startDate ? new Date(`${f.startDate}T00:00:00`).toISOString() : '',
      endDate: f.endDate ? new Date(`${f.endDate}T23:59:59.999`).toISOString() : '',
    };
    try {
      if (promo) await api(`/promotions/${promo._id}`, { method: 'PUT', body });
      else await api('/promotions', { method: 'POST', body });
      toast('Promotion saved', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const uploadImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      toast('Choose a PNG, JPEG, GIF, or WEBP image under 1 MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setF((current) => ({ ...current, image: reader.result }));
    reader.onerror = () => toast('Could not read this image', 'error');
    reader.readAsDataURL(file);
  };

  return (
    <Modal open={open} onClose={onClose} title={promo ? 'Edit Promotion' : 'New Promotion'} width="max-w-2xl" footer={<button className="btn btn-primary" form="promo-form">Save</button>}>
      <div className="mb-5 overflow-hidden rounded-2xl p-6" style={{ background: `linear-gradient(135deg, ${f.color}55, #020617)` }}>
        <div className="flex items-center gap-4">
          <span className="text-5xl">{f.emoji}</span>
          <div>
            <div className="text-2xl font-black">{f.title || 'Promotion title'}</div>
            <div className="text-slate-300">{f.message || 'Message shown on the customer display'}</div>
          </div>
        </div>
      </div>
      <form id="promo-form" onSubmit={save} className="grid grid-cols-2 gap-4">
        <Field label="Title"><input className="input" required maxLength={80} value={f.title} onChange={set('title')} /></Field>
        <Field label="Emoji"><input className="input" maxLength={4} value={f.emoji} onChange={set('emoji')} /></Field>
        <Field label="Message" className="col-span-2"><textarea className="input" rows={2} maxLength={240} value={f.message} onChange={set('message')} /></Field>
        <Field label="Background image URL (optional)" className="col-span-2"><input className="input" type="url" placeholder="https://..." value={f.image.startsWith('data:') ? '' : f.image} onChange={set('image')} /></Field>
        <Field label="Or upload a promo image (max 1 MB)" className="col-span-2">
          <div className="flex items-center gap-3">
            <label className="btn btn-ghost cursor-pointer"><ImagePlus size={16} /> Choose image<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={uploadImage} /></label>
            {f.image && <button type="button" className="btn btn-danger px-3" title="Remove background image" onClick={() => setF({ ...f, image: '' })}><Trash2 size={16} /></button>}
            {f.image && <img src={f.image} alt="Promotion preview" className="h-12 w-20 rounded-md object-cover" />}
          </div>
        </Field>
        <Field label="Start date"><input className="input" type="date" value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label="End date"><input className="input" type="date" value={f.endDate} onChange={set('endDate')} /></Field>
        <Field label="Color" className="col-span-2"><ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
        <Toggle checked={f.active} onChange={(active) => setF({ ...f, active })} label="Show on customer display" />
      </form>
    </Modal>
  );
}

export default function Promotions() {
  const toast = useToast();
  const [promos, setPromos] = useState([]);
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(10);

  const load = useCallback(() => api('/promotions').then(setPromos).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (p) => {
    try {
      await api(`/promotions/${p._id}`, { method: 'PUT', body: { active: !p.active } });
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    await api(`/promotions/${p._id}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
    load();
  };

  const broadcast = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    getSocket().emit('display:message', { text: text.trim(), duration: seconds * 1000, broadcast: true });
    toast('Message sent to all customer displays', 'success');
    setText('');
  };

  return (
    <>
      <PageHeader title="Promotions & Messages" subtitle="Content shown on the customer-facing display">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> New promotion</button>
      </PageHeader>

      <form onSubmit={broadcast} className="card mb-6 flex flex-wrap items-end gap-3 p-5">
        <Field label="Live message to all customer displays" className="min-w-72 flex-1">
          <input className="input" maxLength={200} placeholder="e.g. Store closes in 15 minutes" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field label="Show for (sec)"><input className="input w-28" type="number" min={3} max={120} value={seconds} onChange={(e) => setSeconds(Number(e.target.value) || 10)} /></Field>
        <button className="btn btn-primary h-[42px]"><Send size={16} /> Send now</button>
      </form>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {promos.map((p, i) => (
          <motion.div key={p._id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card overflow-hidden">
            <div className="relative h-36 p-5" style={{ background: `radial-gradient(circle at 80% 20%, ${p.color}88, transparent 60%), linear-gradient(135deg, ${p.color}40, #020617)` }}>
              {p.image && <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
              <span className="absolute right-5 top-4 text-5xl">{p.emoji}</span>
              <div className="relative mt-12 text-xl font-black">{p.title}</div>
              <div className="relative line-clamp-1 text-sm text-slate-300">{p.message}</div>
            </div>
            <div className="flex items-center justify-between p-4">
              <Toggle checked={p.active} onChange={() => toggle(p)} label={p.active ? 'Live' : 'Hidden'} />
              <div className="flex gap-1">
                <button onClick={() => setEditing(p)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil size={16} /></button>
                <button onClick={() => remove(p)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 size={16} /></button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      {!promos.length && <Empty icon={Megaphone} text="No promotions yet" />}

      <PromoForm open={!!editing} promo={editing?._id ? editing : null} onClose={() => setEditing(null)} onSaved={load} />
    </>
  );
} 