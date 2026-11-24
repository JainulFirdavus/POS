

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Plus, ShieldCheck, ShoppingCart, Trash2, Users as UsersIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import { ColorPicker, Empty, Field, PageHeader, Toggle, onColor } from '../../components/ui';

const EMPTY = { name: '', username: '', role: 'cashier', secret: '', color: '#10b981', active: true };

function UserForm({ open, user, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  useEffect(() => {
    if (open) setF(user ? { ...EMPTY, ...user, secret: '' } : EMPTY);
  }, [open, user]);

  const save = async (e) => {
    e.preventDefault();
    const body = { name: f.name, username: f.username, role: f.role, color: f.color, active: f.active, ...(f.secret && { secret: f.secret }) };
    try {
      if (user) await api(`/users/${user._id}`, { method: 'PUT', body });
      else await api('/users', { method: 'POST', body });
      toast('User saved', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const isCashier = f.role === 'cashier';
  return (
    <Modal open={open} onClose={onClose} title={user ? 'Edit User' : 'New User'} footer={<button className="btn btn-primary" form="user-form">Save</button>}>
      <form id="user-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[['cashier', 'Seller', ShoppingCart, 'bg-emerald-600'], ['admin', 'Admin', ShieldCheck, 'bg-indigo-500']].map(([id, label, Icon, bg]) => (
            <button key={id} type="button" onClick={() => setF({ ...f, role: id, secret: '' })} className={`relative flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${f.role === id ? 'text-on-accent' : 'bg-slate-800 text-slate-400'}`}>
              {f.role === id && <motion.span layoutId="role-pill" className={`absolute inset-0 rounded-xl ${bg}`} />}
              <Icon size={16} className="relative" /> <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Display name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Username"><input className="input" required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        </div>
        <Field label={isCashier ? `PIN (4-6 digits)${user ? ' — leave blank to keep' : ''}` : `Password (min 6)${user ? ' — leave blank to keep' : ''}`}>
          <input
            className="input"
            type="password"
            inputMode={isCashier ? 'numeric' : undefined}
            pattern={isCashier ? '\\d{4,6}' : undefined}
            minLength={isCashier ? 4 : 6}
            maxLength={isCashier ? 6 : 128}
            required={!user}
            autoComplete="new-password"
            value={f.secret}
            onChange={(e) => setF({ ...f, secret: e.target.value })}
          />
        </Field>
        <Field label="Avatar color"><ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
        <Toggle checked={f.active} onChange={(active) => setF({ ...f, active })} label="Active" />
      </form>
    </Modal>
  );
}
export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => api('/users').then(setUsers).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.name}?`)) return;
    try {
      await api(`/users/${u._id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader title="Users" subtitle="Sellers log in with a PIN, admins with a password">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add user</button>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {users.map((u, i) => (
          <motion.div key={u._id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className={`card flex items-center gap-4 p-5 ${u.active ? '' : 'opacity-50'}`}>
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-bold" style={{ background: u.color, color: onColor(u.color) }}>{u.name[0]}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{u.name} {u._id === me.id && <span className="text-xs text-slate-500">(you)</span>}</div>
              <div className="text-xs text-slate-500">@{u.username}</div>
              <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${u.role === 'admin' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                {u.role === 'admin' ? 'ADMIN' : 'SELLER'}
              </span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditing(u)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil size={16} /></button>
              {u._id !== me.id && <button onClick={() => remove(u)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"><Trash2 size={16} /></button>}
            </div>
          </motion.div>
        ))}
      </div>
      {!users.length && <Empty icon={UsersIcon} text="No users" />}
      <UserForm open={!!editing} user={editing?._id ? editing : null} onClose={() => setEditing(null)} onSaved={load} />
    </>
  );
} 