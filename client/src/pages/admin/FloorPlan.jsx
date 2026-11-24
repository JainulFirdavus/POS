import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Armchair, BellRing, Circle, CircleDot, Copy, Eraser, Eye, EyeOff, LayoutGrid, MousePointer2, Pencil, Plus, Radio, RectangleHorizontal, RefreshCw, Square, Timer, Trash2, WandSparkles,
} from 'lucide-react';
import Modal from '../../components/Modal';
import { Empty, Field, PageHeader, Segmented, StatCard, Toggle } from '../../components/ui';
import {
  AreaIcon, AreaTabs, CALL_META, CallsPanel, DECOR, FloorCanvas, FloorLive, TableShape, minutesSince, useFloorData, useFloorMaps, tableState,
} from '../../components/FloorPlan';
import { tabCount, tabSubtotal } from '../../components/DineIn';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { fmtDateTime } from '../../lib/dates';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';

const TABLE_TOOLS = {
  square: { label: 'Table', icon: Square, w: 1, h: 1, shape: 'square', seats: 4 },
  round: { label: 'Round table', icon: Circle, w: 1, h: 1, shape: 'round', seats: 4 },
  long: { label: 'Long table 2×1', icon: RectangleHorizontal, w: 2, h: 1, shape: 'square', seats: 6 },
  banquet: { label: 'Banquet round 2×2', icon: CircleDot, w: 2, h: 2, shape: 'round', seats: 10 },
};
const SIZES = [
  { cols: 10, rows: 10, label: '10 × 10' },
  { cols: 8, rows: 6, label: 'Small room 8 × 6' },
  { cols: 16, rows: 10, label: 'Hall 16 × 10' },
  { cols: 24, rows: 14, label: 'Big hall 24 × 14' },
];
const TEMPLATES = [
  { value: 'room', label: 'Walled room' },
  { value: 'hall', label: 'Banquet hall' },
  { value: 'terrace', label: 'Terrace / garden' },
  { value: 'blank', label: 'Empty' },
];

// Starting fixtures for a new area; everything can be redrawn afterwards.
function templateDecor(template, cols, rows) {
  const out = new Map();
  const set = (x, y, type) => out.set(`${x},${y}`, { x, y, type });
  const mid = Math.floor(cols / 2);
  const doors = cols >= 12 ? [mid - 1, mid] : [mid];
  if (template === 'blank') return [];
  if (template === 'terrace') {
    // The building is along the top; plants line the open sides.
    for (let x = 0; x < cols; x++) set(x, 0, doors.includes(x) ? 'door' : 'wall');
    for (let y = 1; y < rows; y++) for (const x of [0, cols - 1]) if (y % 2 === 0) set(x, y, 'plant');
    for (let x = 1; x < cols - 1; x++) if (x % 2 === 1) set(x, rows - 1, 'plant');
    return [...out.values()];
  }
  for (let x = 0; x < cols; x++) {
    set(x, 0, x > 0 && x < cols - 1 && x % 3 === 1 ? 'window' : 'wall');
    set(x, rows - 1, doors.includes(x) ? 'door' : 'wall');
  }
  for (let y = 1; y < rows - 1; y++) {
    set(0, y, template === 'hall' && y % 3 === 1 ? 'window' : 'wall');
    set(cols - 1, y, template === 'hall' && y % 3 === 1 ? 'window' : 'wall');
  }
  set(1, rows - 2, 'cashier');
  set(cols - 2, 1, 'kitchen');
  if (template === 'hall') {
    for (let x = mid - 2; x <= mid + 1; x++) set(x, 1, 'stage');
    set(1, 1, 'restroom');
    set(cols - 3, 1, 'kitchen');
    set(cols - 2, rows - 2, 'counter');
  }
  return [...out.values()];
}

function AreaModal({ open, area, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', kind: 'indoor', cols: 10, rows: 10, template: 'room' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(area ? { name: area.name, kind: area.kind, cols: area.cols, rows: area.rows } : { name: '', kind: 'indoor', cols: 10, rows: 10, template: 'room' });
  }, [open, area]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: form.name.trim() || (form.kind === 'outdoor' ? 'Outdoor' : 'Indoor'), kind: form.kind, cols: Number(form.cols), rows: Number(form.rows) };
      if (!area) body.decor = templateDecor(form.template, body.cols, body.rows);
      const saved = await api(area ? `/floor/areas/${area._id}` : '/floor/areas', { method: area ? 'PUT' : 'POST', body });
      toast(area ? 'Area updated' : `${saved.name} created`, 'success');
      onSaved(saved);
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
      title={area ? `Edit ${area.name}` : 'New area'}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" form="area-form" disabled={busy}>{area ? 'Save' : 'Create area'}</button>
        </>
      }
    >
      <form id="area-form" onSubmit={save} className="space-y-4">
        <Field label="Name"><input className="input" autoFocus maxLength={40} placeholder="e.g. Main hall, Garden, VIP room" value={form.name} onChange={(e) => set('name')(e.target.value)} /></Field>
        <Field label="Type">
          <Segmented
            id="area-kind"
            value={form.kind}
            onChange={(k) => setForm((f) => ({ ...f, kind: k, ...(!area && { template: k === 'outdoor' ? 'terrace' : 'room' }) }))}
            options={[{ value: 'indoor', label: 'Indoor (inner)' }, { value: 'outdoor', label: 'Outdoor (outer)' }]}
          />
        </Field>
        <Field label="Grid size (columns × rows)">
          <div className="mb-2 flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <button key={s.label} type="button" onClick={() => setForm((f) => ({ ...f, cols: s.cols, rows: s.rows }))} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${Number(form.cols) === s.cols && Number(form.rows) === s.rows ? 'bg-indigo-500 text-on-accent' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min={4} max={30} className="input w-24" value={form.cols} onChange={(e) => set('cols')(e.target.value)} />
            <span className="text-slate-500">×</span>
            <input type="number" min={4} max={30} className="input w-24" value={form.rows} onChange={(e) => set('rows')(e.target.value)} />
            <span className="text-xs text-slate-500">4 to 30 cells each way</span>
          </div>
        </Field>
        {!area && (
          <Field label="Start from">
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button key={t.value} type="button" onClick={() => set('template')(t.value)} className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ${form.template === t.value ? 'border-indigo-400 bg-indigo-500/15' : 'border-white/10 hover:bg-white/5'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Walls, doors and fixtures can be redrawn afterwards.</p>
          </Field>
        )}
      </form>
    </Modal>
  );
}

function Toolbar({ tool, setTool }) {
  const btn = (key, label, icon) => (
    <button
      key={key}
      type="button"
      title={label}
      onClick={() => setTool(key)}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${tool === key ? 'bg-indigo-500 text-on-accent' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
    >
      {icon}
      <span className="hidden 2xl:inline">{label}</span>
    </button>
  );
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {btn('select', 'Select / move', <MousePointer2 size={15} />)}
        <span className="mx-1 h-5 w-px bg-white/10" />
        {Object.entries(TABLE_TOOLS).map(([k, t]) => btn(k, t.label, <t.icon size={15} />))}
        <span className="mx-1 h-5 w-px bg-white/10" />
        {Object.entries(DECOR).map(([k, d]) => btn(k, d.label, d.icon ? <span className="text-sm leading-none">{d.icon}</span> : d.glass ? <span className="h-3.5 w-3.5 rounded-sm border-2 border-slate-500 bg-sky-300/70" /> : <span className={`h-3.5 w-3.5 rounded-sm ${d.cls}`} />))}
        {btn('erase', 'Eraser', <Eraser size={15} />)}
      </div>
      <p className="text-xs text-slate-500">
        {tool === 'select' && 'Click a table to edit it. Drag a table to move it.'}
        {TABLE_TOOLS[tool] && `Click an empty cell to place a ${TABLE_TOOLS[tool].label.toLowerCase()}.`}
        {DECOR[tool] && `Click or drag across cells to draw: ${DECOR[tool].label.toLowerCase()}.`}
        {tool === 'erase' && 'Click or drag across cells to remove fixtures.'}
      </p>
    </div>
  );
}

function TableEditor({ table, areas, cards, onClose }) {
  const toast = useToast();
  const initialCard = table.card?._id ?? '';
  const [form, setForm] = useState({});
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setForm({ name: table.name, seats: table.seats, shape: table.shape, w: table.w, h: table.h, cardId: initialCard, buzzer: table.buzzer ?? '', area: String(table.area) });
    setListening(false);
  }, [table, initialCard]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Pairing: press any button on the device and its ID fills in.
  useEffect(() => {
    if (!listening) return;
    const s = getSocket();
    const onSeen = (d) => {
      setForm((f) => ({ ...f, buzzer: d.device }));
      setListening(false);
      toast(d.table && d.table !== table.name ? `Detected ${d.device} (now on ${d.table}; saving moves it here)` : `Detected ${d.device}`, 'success');
    };
    s.on('buzzer:seen', onSeen);
    const stop = setTimeout(() => setListening(false), 60000);
    return () => {
      s.off('buzzer:seen', onSeen);
      clearTimeout(stop);
    };
  }, [listening, table.name, toast]);

  const cardOptions = useMemo(() => {
    const opts = [];
    if (table.card?.virtual) opts.push({ value: table.card._id, label: 'No physical card: tap the table on screen' });
    else opts.push({ value: 'new', label: 'No physical card: tap the table on screen' });
    if (table.card && !table.card.virtual) opts.push({ value: table.card._id, label: `💳 ${table.card.label} · ${table.card.uid}` });
    for (const c of cards) if (!c.virtual && !c.table && c._id !== table.card?._id) opts.push({ value: c._id, label: `💳 ${c.label} · ${c.uid}${c.active ? '' : ' (disabled)'}` });
    if (!table.card) opts.unshift({ value: '', label: 'None linked' });
    return opts;
  }, [cards, table.card]);

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const body = { name: form.name, seats: Number(form.seats), shape: form.shape, w: Number(form.w), h: Number(form.h), buzzer: form.buzzer };
      if (form.area !== String(table.area)) body.area = form.area;
      if (form.cardId !== initialCard && form.cardId !== '') body.cardId = form.cardId;
      // A buzzer moving from another table is unpaired there first.
      if (form.buzzer && form.buzzer.toUpperCase() !== (table.buzzer ?? '')) {
        const { tables } = await api('/floor');
        const other = tables.find((t) => t.buzzer === form.buzzer.toUpperCase().replace(/[^0-9A-Z_-]/g, '') && t._id !== table._id);
        if (other) await api(`/floor/tables/${other._id}`, { method: 'PUT', body: { buzzer: '' } });
      }
      await api(`/floor/tables/${table._id}`, { method: 'PUT', body });
      toast(`${form.name} saved`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${table.name} from the floor plan?`)) return;
    try {
      await api(`/floor/tables/${table._id}`, { method: 'DELETE' });
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const test = async (type) => {
    try {
      await api('/calls', { method: 'POST', body: { tableId: table._id, type } });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold"><Armchair size={18} /> {table.name}</h3>
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-white">Close</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className="input" maxLength={20} value={form.name ?? ''} onChange={(e) => set('name')(e.target.value)} /></Field>
        <Field label="Seats"><input type="number" min={1} max={30} className="input" value={form.seats ?? 4} onChange={(e) => set('seats')(e.target.value)} /></Field>
        <Field label="Width (cells)"><input type="number" min={1} max={6} className="input" value={form.w ?? 1} onChange={(e) => set('w')(e.target.value)} /></Field>
        <Field label="Depth (cells)"><input type="number" min={1} max={6} className="input" value={form.h ?? 1} onChange={(e) => set('h')(e.target.value)} /></Field>
      </div>
      <Field label="Shape">
        <Segmented id="tbl-shape" value={form.shape} onChange={set('shape')} options={[{ value: 'square', label: 'Square' }, { value: 'round', label: 'Round' }]} />
      </Field>
      {areas.length > 1 && (
        <Field label="Area">
          <select className="input" value={form.area ?? ''} onChange={(e) => set('area')(e.target.value)}>
            {areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="RFID card for this table's tab">
        <select className="input" value={form.cardId ?? ''} onChange={(e) => set('cardId')(e.target.value)}>
          {cardOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Buzzer / call button ID">
        <div className="flex gap-2">
          <input className="input font-mono uppercase" maxLength={40} placeholder="e.g. TABLE-05" value={form.buzzer ?? ''} onChange={(e) => set('buzzer')(e.target.value)} />
          <button type="button" onClick={() => setListening((l) => !l)} className={`btn shrink-0 px-3 ${listening ? 'animate-pulse bg-amber-500/20 text-amber-300' : 'btn-ghost'}`} title="Press a button on the device to fill in its ID">
            <Radio size={15} /> {listening ? 'Press it now…' : 'Detect'}
          </button>
        </div>
      </Field>
      <div className="flex gap-2">
        <button type="button" onClick={() => test('waiter')} className="btn btn-ghost flex-1 px-2 text-xs">🔔 Test waiter call</button>
        <button type="button" onClick={() => test('bill')} className="btn btn-ghost flex-1 px-2 text-xs">🧾 Test bill</button>
      </div>
      <div className="flex gap-2 border-t border-white/5 pt-4">
        <button type="button" onClick={remove} className="btn btn-danger px-3"><Trash2 size={15} /></button>
        <button className="btn btn-primary flex-1" disabled={busy}>Save table</button>
      </div>
    </form>
  );
}

function AreaPanel({ area, tables, cards, onEdit, onDecor }) {
  const toast = useToast();
  const unplaced = cards.filter((c) => !c.virtual && !c.table && c.active);
  const seats = tables.reduce((s, t) => s + t.seats, 0);
  const autoPlace = async () => {
    try {
      const r = await api(`/floor/areas/${area._id}/auto-place`, { method: 'POST' });
      toast(`${r.placed} table(s) placed${r.left ? `, ${r.left} did not fit` : ''}`, r.left ? 'info' : 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${area.name} and its ${tables.length} table(s)?`)) return;
    try {
      await api(`/floor/areas/${area._id}`, { method: 'DELETE' });
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${area.kind === 'outdoor' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-indigo-500/15 text-indigo-300'}`}><AreaIcon kind={area.kind} size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{area.name}</div>
          <div className="text-xs text-slate-400">{area.kind === 'outdoor' ? 'Outdoor' : 'Indoor'} · {area.cols} × {area.rows} grid</div>
        </div>
        <button onClick={onEdit} title="Edit area" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><Pencil size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-white/5 p-3"><div className="text-2xl font-black">{tables.length}</div><div className="text-xs text-slate-400">tables</div></div>
        <div className="rounded-xl bg-white/5 p-3"><div className="text-2xl font-black">{seats}</div><div className="text-xs text-slate-400">seats</div></div>
      </div>
      {unplaced.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 text-sm">
          <div className="font-semibold">{unplaced.length} RFID card(s) not on the plan yet</div>
          <div className="mt-0.5 truncate text-xs text-slate-400">{unplaced.map((c) => c.label).join(', ')}</div>
          <button onClick={autoPlace} className="btn btn-ghost mt-2 w-full py-1.5 text-xs"><WandSparkles size={14} /> Place them in this area</button>
        </div>
      )}
      <div className="space-y-1 text-xs text-slate-400">
        <p>New tables get a virtual card, so they can be tapped on the POS floor plan without a physical RFID card.</p>
        <p>Select a table to set seats, size, its RFID card and its buzzer.</p>
      </div>
      <div className="flex gap-2 border-t border-white/5 pt-4">
        <button onClick={() => window.confirm('Remove all walls and fixtures from this area?') && onDecor([])} className="btn btn-ghost flex-1 px-2 text-xs"><Eraser size={14} /> Clear fixtures</button>
        <button onClick={remove} className="btn btn-danger flex-1 px-2 text-xs"><Trash2 size={14} /> Delete area</button>
      </div>
    </div>
  );
}

function Designer({ floor, area, cards }) {
  const toast = useToast();
  const [tool, setTool] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [decor, setDecor] = useState(area.decor);
  const [drag, setDrag] = useState(null);
  const decorRef = useRef(area.decor);
  const painting = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (painting.current) return;
    decorRef.current = area.decor;
    setDecor(area.decor);
  }, [area]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (setTool('select'), setSelectedId(null));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tables = useMemo(() => floor.tables.filter((t) => String(t.area) === area._id), [floor.tables, area._id]);
  const selected = floor.tables.find((t) => t._id === selectedId);
  const tableAt = (x, y, ignore) => tables.find((t) => t._id !== ignore && x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
  const clashes = (t, x, y) => tables.some((o) => o._id !== t._id && x < o.x + o.w && o.x < x + t.w && y < o.y + o.h && o.y < y + t.h);

  const cellAt = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: Math.floor(((e.clientX - r.left) / r.width) * area.cols), y: Math.floor(((e.clientY - r.top) / r.height) * area.rows) };
  };
  const inside = (c) => c.x >= 0 && c.y >= 0 && c.x < area.cols && c.y < area.rows;

  const saveDecor = async (next) => {
    try {
      await api(`/floor/areas/${area._id}`, { method: 'PUT', body: { decor: next } });
    } catch (err) {
      toast(err.message, 'error');
      floor.reloadFloor();
    }
  };
  const replaceDecor = (next) => {
    decorRef.current = next;
    setDecor(next);
    saveDecor(next);
  };

  const paint = (c) => {
    const key = `${c.x},${c.y}`;
    if (!inside(c) || painting.current.last === key || tableAt(c.x, c.y)) return;
    painting.current.last = key;
    const rest = decorRef.current.filter((d) => d.x !== c.x || d.y !== c.y);
    const next = tool === 'erase' ? rest : [...rest, { x: c.x, y: c.y, type: tool }];
    if (tool === 'erase' && next.length === decorRef.current.length) return;
    decorRef.current = next;
    painting.current.dirty = true;
    setDecor(next);
  };

  const nextName = () => {
    const nums = floor.tables.map((t) => Number(/^T(\d+)$/i.exec(t.name)?.[1])).filter(Boolean);
    return `T${nums.length ? Math.max(...nums) + 1 : floor.tables.length + 1}`;
  };

  const placeTable = async (c) => {
    const spec = TABLE_TOOLS[tool];
    const x = Math.min(c.x, area.cols - spec.w);
    const y = Math.min(c.y, area.rows - spec.h);
    const probe = { _id: null, w: spec.w, h: spec.h };
    if (clashes(probe, x, y)) return toast('Not enough room there', 'error');
    for (let dx = 0; dx < spec.w; dx++) for (let dy = 0; dy < spec.h; dy++) if (decorRef.current.some((d) => d.x === x + dx && d.y === y + dy)) return toast('Erase the fixture there first', 'error');
    try {
      const t = await api('/floor/tables', { method: 'POST', body: { area: area._id, name: nextName(), x, y, w: spec.w, h: spec.h, shape: spec.shape, seats: spec.seats } });
      floor.setFloor((f) => ({ ...f, tables: [...f.tables.filter((o) => o._id !== t._id), t] }));
      setSelectedId(t._id);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const moveTable = async (t, x, y) => {
    floor.setFloor((f) => ({ ...f, tables: f.tables.map((o) => (o._id === t._id ? { ...o, x, y } : o)) }));
    try {
      await api(`/floor/tables/${t._id}`, { method: 'PUT', body: { x, y } });
    } catch (err) {
      toast(err.message, 'error');
      floor.reloadFloor();
    }
  };

  // Keeps the drag going when the pointer leaves the plan.
  const capture = (e) => {
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* not supported for this pointer */
    }
  };
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const c = cellAt(e);
    if (!inside(c)) return;
    const hit = tableAt(c.x, c.y);
    if (hit) {
      if (tool !== 'select') setTool('select');
      setSelectedId(hit._id);
      setDrag({ id: hit._id, dx: c.x - hit.x, dy: c.y - hit.y, x: hit.x, y: hit.y });
      capture(e);
    } else if (tool === 'select') {
      setSelectedId(null);
    } else if (TABLE_TOOLS[tool]) {
      placeTable(c);
    } else {
      painting.current = { last: null, dirty: false };
      capture(e);
      paint(c);
    }
  };
  const onPointerMove = (e) => {
    if (drag) {
      const t = tables.find((o) => o._id === drag.id);
      if (!t) return;
      const c = cellAt(e);
      const x = Math.max(0, Math.min(area.cols - t.w, c.x - drag.dx));
      const y = Math.max(0, Math.min(area.rows - t.h, c.y - drag.dy));
      if (x !== drag.x || y !== drag.y) setDrag({ ...drag, x, y });
    } else if (painting.current) paint(cellAt(e));
  };
  const onPointerUp = () => {
    if (painting.current) {
      const { dirty } = painting.current;
      painting.current = null;
      if (dirty) saveDecor(decorRef.current);
    }
    if (drag) {
      const t = tables.find((o) => o._id === drag.id);
      setDrag(null);
      if (!t || (drag.x === t.x && drag.y === t.y)) return;
      if (clashes(t, drag.x, drag.y)) return toast('Tables cannot overlap', 'error');
      // Dropping a table onto fixtures clears them.
      const under = (d) => d.x >= drag.x && d.x < drag.x + t.w && d.y >= drag.y && d.y < drag.y + t.h;
      if (decorRef.current.some(under)) replaceDecor(decorRef.current.filter((d) => !under(d)));
      moveTable(t, drag.x, drag.y);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="card p-4">
        <Toolbar tool={tool} setTool={setTool} />
        <FloorCanvas
          area={area}
          decor={decor}
          maxHeight="70vh"
          canvasRef={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={tool === 'select' ? '' : 'cursor-crosshair'}
        >
          {tables.map((t) => {
            const dragging = drag?.id === t._id;
            const bad = dragging && clashes(t, drag.x, drag.y);
            const sub = [t.w > 1 && `${t.seats} seats`, t.buzzer && '📟', t.card && !t.card.virtual && '💳'].filter(Boolean).join(' ');
            return (
              <TableShape
                key={t._id}
                table={t}
                state={{ kind: bad ? 'invalid' : 'design', calls: [] }}
                sub={sub}
                selected={selectedId === t._id}
                lifted={dragging}
                preview={dragging ? { x: drag.x, y: drag.y } : null}
                title={`${t.name} · ${t.seats} seats${t.buzzer ? ` · buzzer ${t.buzzer}` : ''}${t.card && !t.card.virtual ? ` · card ${t.card.label}` : ''}`}
              />
            );
          })}
        </FloorCanvas>
      </div>
      <div>
        {selected ? (
          <TableEditor key={selected._id} table={selected} areas={floor.areas} cards={cards} onClose={() => setSelectedId(null)} />
        ) : (
          <AreaPanel area={area} tables={tables} cards={cards} onEdit={() => floor.onEditArea(area)} onDecor={replaceDecor} />
        )}
      </div>
    </div>
  );
}

function TableInfo({ table, state, money, onClose }) {
  const toast = useToast();
  const test = async (type) => {
    try {
      await api('/calls', { method: 'POST', body: { tableId: table._id, type } });
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const tab = state.tab;
  return (
    <div className="card mb-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold">{table.name} <span className="text-xs font-normal text-slate-400">· {table.seats} seats</span></h3>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-white">Close</button>
      </div>
      {tab ? (
        <>
          <div className="text-2xl font-black tabular-nums">{money(tabSubtotal(tab))}</div>
          <div className="mb-2 text-xs text-slate-400">{tab.guests} guest(s) · {tabCount(tab)} items · seated {minutesSince(tab.createdAt)} min · by {tab.openedBy?.name}</div>
          <div className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
            {tab.items.map((it) => (
              <div key={it._id} className="flex justify-between gap-2"><span className="truncate">{it.qty} × {it.name}</span><span className="tabular-nums text-slate-400">{money(it.price * it.qty)}</span></div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-400">{state.kind === 'nocard' ? 'No card linked: open Design to link one.' : 'Free. No open tab.'}</div>
      )}
      <div className="mt-3 text-xs text-slate-500">{table.buzzer ? `Buzzer ${table.buzzer}` : 'No buzzer paired'}</div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => test('waiter')} className="btn btn-ghost flex-1 px-2 py-1.5 text-xs">🔔 Test call</button>
        <button onClick={() => test('bill')} className="btn btn-ghost flex-1 px-2 py-1.5 text-xs">🧾 Test bill</button>
      </div>
    </div>
  );
}

const ESP32_SKETCH = (origin, key) => `// ESP32 table buzzer: button on GPIO 4 = call waiter, GPIO 5 = bill.
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI = "your-wifi";      const char* PASS = "wifi-password";
const char* POS  = "${origin}";      // this POS computer's address on the network
const char* KEY  = "${key}";
const char* ID   = "TABLE-01";       // pair this ID with a table on the floor plan

void send(const char* action) {
  HTTPClient http;
  http.begin(String(POS) + "/api/buzzer/press/" + ID + "/" + action);
  http.addHeader("X-Buzzer-Key", KEY);
  http.POST("");
  http.end();
}

void setup() {
  pinMode(4, INPUT_PULLUP); pinMode(5, INPUT_PULLUP);
  WiFi.begin(WIFI, PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  if (digitalRead(4) == LOW) { send("waiter"); delay(1500); }
  if (digitalRead(5) == LOW) { send("bill");   delay(1500); }
}`;

function BuzzerSetup() {
  const toast = useToast();
  const [cfg, setCfg] = useState(null);
  const [show, setShow] = useState(false);
  const [seen, setSeen] = useState([]);
  useEffect(() => {
    api('/buzzer/config').then(setCfg).catch((e) => toast(e.message, 'error'));
    const s = getSocket();
    const onSeen = (d) => setSeen((list) => [d, ...list.filter((x) => x.device !== d.device)].slice(0, 6));
    s.on('buzzer:seen', onSeen);
    return () => s.off('buzzer:seen', onSeen);
  }, [toast]);

  const origin = window.location.origin;
  const url = (action) => `${origin}/api/buzzer/press/TABLE-01/${action}?key=${show ? cfg?.key : '••••••'}`;
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied', 'success');
    } catch {
      toast('Copy failed: select the text and copy it instead', 'error');
    }
  };
  const update = async (path, method, body) => {
    try {
      setCfg(await api(path, { method, body }));
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  if (!cfg) return null;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold"><Radio size={18} /> Table buzzers</h3>
        <Toggle checked={cfg.enabled} onChange={(enabled) => update('/buzzer/config', 'PUT', { enabled })} label={cfg.enabled ? 'On' : 'Off'} />
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Each table gets a Wi-Fi call button (an ESP32/ESP8266 board, a Shelly Button, or a bridge for an RF buzzer receiver). A press opens a URL on this POS; every register chimes and the table flashes on the floor plan.
      </p>
      <Field label="Device key">
        <div className="flex gap-2">
          <input readOnly className="input font-mono" value={show ? cfg.key : '•'.repeat(16)} />
          <button title={show ? 'Hide' : 'Show'} onClick={() => setShow(!show)} className="btn btn-ghost px-3">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          <button title="Copy" onClick={() => copy(cfg.key)} className="btn btn-ghost px-3"><Copy size={15} /></button>
          <button
            title="New key (every device must be updated)"
            onClick={() => window.confirm('Make a new key? Every buzzer must be updated with it.') && update('/buzzer/config/key', 'POST')}
            className="btn btn-ghost px-3"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </Field>
      <div className="mt-4 space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Device URLs (GET or POST)</div>
        {['waiter', 'bill', 'cancel'].map((a) => (
          <button key={a} onClick={() => copy(url(a).replace('••••••', cfg.key))} className="block w-full truncate rounded-lg bg-slate-950/60 px-3 py-2 text-left font-mono text-xs text-slate-300 hover:bg-slate-950" title="Copy">
            {url(a)}
          </button>
        ))}
        <p className="text-xs text-slate-500">
          Replace TABLE-01 with the device ID. Use this computer's network address (not localhost) on the devices. The key can also go in an <code>X-Buzzer-Key</code> header. <code>cancel</code> clears the table's calls; <code>ping</code> tests the connection.
        </p>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-indigo-300">Example ESP32 sketch</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-950/70 p-3 text-[11px] leading-relaxed text-slate-300">{ESP32_SKETCH(origin, show ? cfg.key : 'paste-the-key-here')}</pre>
      </details>
      <div className="mt-4">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Devices pressed recently</div>
        {seen.length ? (
          seen.map((d) => (
            <div key={d.device} className="flex items-center justify-between border-t border-white/5 py-1.5 text-sm">
              <span className="font-mono">{d.device}</span>
              <span className="text-xs text-slate-400">{d.action} · {d.table ? <span className="text-emerald-400">{d.table}</span> : <span className="text-amber-300">not paired</span>}</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">Press a buzzer to see it here. To pair it, select a table in Design and use Detect.</p>
        )}
      </div>
    </div>
  );
}

const responseTime = (c) => {
  const end = c.ackAt || c.doneAt;
  return end ? Math.max(0, Math.round((new Date(end) - new Date(c.createdAt)) / 1000)) : null;
};
const fmtSecs = (s) => (s == null ? '-' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`);

function RecentCalls({ recent }) {
  if (!recent.length) return null;
  const STATUS = { open: 'text-rose-400', ack: 'text-amber-300', done: 'text-emerald-400', cancelled: 'text-slate-500' };
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-white/5 px-5 py-4 font-semibold">Recent table calls</div>
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full">
          <thead><tr><th className="th">Time</th><th className="th">Table</th><th className="th">Request</th><th className="th">Response</th><th className="th">Handled by</th><th className="th">Status</th></tr></thead>
          <tbody>
            {recent.map((c) => (
              <tr key={c._id} className="border-t border-white/5">
                <td className="td text-slate-400">{fmtDateTime(c.createdAt)}</td>
                <td className="td font-semibold">{c.tableName} <span className="text-xs font-normal text-slate-500">{c.areaName}</span></td>
                <td className="td">{CALL_META[c.type]?.emoji} {CALL_META[c.type]?.short}{c.presses > 1 && <span className="text-xs text-amber-300"> ×{c.presses}</span>}{c.source === 'staff' && <span className="text-xs text-slate-500"> (staff)</span>}</td>
                <td className="td tabular-nums">{fmtSecs(responseTime(c))}</td>
                <td className="td">{c.ackBy || c.doneBy || '-'}</td>
                <td className={`td capitalize ${STATUS[c.status]}`}>{c.status === 'ack' ? 'On the way' : c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FloorPlan() {
  const { money } = useSettings();
  const floor = useFloorData();
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem('floor_mode') || 'live';
    } catch {
      return 'live';
    }
  });
  const [areaId, setAreaId] = useState(null);
  const [areaModal, setAreaModal] = useState(null); // {area} for edit, {} for new
  const [tabs, setTabs] = useState([]);
  const [cards, setCards] = useState([]);
  const [recent, setRecent] = useState([]);
  const [selected, setSelected] = useState(null);

  const loadTabs = useCallback(() => api('/tabs').then(setTabs).catch(() => {}), []);
  const loadCards = useCallback(() => api('/rfid').then(setCards).catch(() => {}), []);
  const loadRecent = useCallback(() => api('/calls?recent=1').then(setRecent).catch(() => {}), []);
  useEffect(() => {
    loadTabs();
    loadCards();
    loadRecent();
    const s = getSocket();
    const onTabs = () => {
      loadTabs();
      loadCards();
    };
    s.on('tabs:changed', onTabs);
    s.on('floor:changed', loadCards);
    s.on('calls:changed', loadRecent);
    return () => {
      s.off('tabs:changed', onTabs);
      s.off('floor:changed', loadCards);
      s.off('calls:changed', loadRecent);
    };
  }, [loadTabs, loadCards, loadRecent]);

  const changeMode = (m) => {
    setMode(m);
    try {
      localStorage.setItem('floor_mode', m);
    } catch {
      /* not saved */
    }
  };

  const { tabByCard, callsByTable } = useFloorMaps(tabs, floor.calls);
  const area = floor.areas.find((a) => a._id === areaId) ?? floor.areas[0];
  const selTable = floor.tables.find((t) => t._id === selected);
  const today = new Date().toDateString();
  const todays = recent.filter((c) => new Date(c.createdAt).toDateString() === today);
  const times = todays.map(responseTime).filter((s) => s != null);
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

  const openTable = (call) => setSelected(String(call.table));

  return (
    <>
      <PageHeader title="Floor plan & table buzzers" subtitle="Map indoor rooms, halls and outdoor areas on a grid, see every table live, and answer guest call buttons">
        <Segmented id="floor-mode" value={mode} onChange={changeMode} options={[{ value: 'live', label: 'Live' }, { value: 'design', label: 'Design' }]} />
        <button className="btn btn-primary" onClick={() => setAreaModal({})}><Plus size={16} /> Add area</button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={LayoutGrid} label="Tables mapped" value={floor.tables.length} color="#6366f1" />
        <StatCard icon={Armchair} label="Seats" value={floor.tables.reduce((s, t) => s + t.seats, 0)} color="#10b981" delay={0.05} />
        <StatCard icon={BellRing} label="Calls waiting" value={floor.calls.length} color="#f43f5e" delay={0.1} />
        <StatCard icon={Timer} label="Avg. response today" value={avg ?? 0} format={(v) => (avg == null ? '-' : fmtSecs(Math.round(v)))} color="#f59e0b" delay={0.15} />
      </div>

      {!floor.loaded ? null : !floor.areas.length ? (
        <div className="card mb-6 p-8 text-center">
          <Empty icon={LayoutGrid} text="No areas yet. Start with the main dining room, then add outdoor seating or a hall." />
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary" onClick={() => setAreaModal({})}><Plus size={16} /> Add first area</button>
          </div>
        </div>
      ) : mode === 'design' ? (
        <div className="mb-6">
          <AreaTabs areas={floor.areas} value={area._id} onChange={setAreaId} />
          <Designer key={area._id} floor={{ ...floor, onEditArea: (a) => setAreaModal({ area: a }) }} area={area} cards={cards} />
        </div>
      ) : (
        <div className="mb-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="card p-4">
            <FloorLive areas={floor.areas} tables={floor.tables} tabs={tabs} calls={floor.calls} areaId={area._id} onAreaChange={setAreaId} selectedId={selected} onTableClick={(t) => setSelected(t._id)} maxHeight="66vh" />
          </div>
          <div>
            {selTable && <TableInfo table={selTable} state={tableState(selTable, tabByCard, callsByTable)} money={money} onClose={() => setSelected(null)} />}
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Calls ({floor.calls.length})</h3>
            <CallsPanel calls={floor.calls} onOpenTable={openTable} />
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <BuzzerSetup />
        <RecentCalls recent={recent} />
      </div>

      <AreaModal
        open={!!areaModal}
        area={areaModal?.area}
        onClose={() => setAreaModal(null)}
        onSaved={(a) => {
          setAreaModal(null);
          setAreaId(a._id);
          if (!areaModal?.area) changeMode('design');
          floor.reloadFloor();
        }}
      />
    </>
  );
}
