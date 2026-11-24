import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Check, Footprints, House, LayoutGrid, ReceiptText, Trees } from 'lucide-react';
import Modal from './Modal';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { tabSubtotal } from './DineIn';

// ---- Fixtures that can be drawn on the plan (one per cell) ----
export const DECOR = {
  wall: { label: 'Wall', cls: 'bg-slate-500 shadow-inner' },
  window: { label: 'Window', cls: 'bg-slate-500 p-[28%]', glass: true },
  door: { label: 'Door / entrance', cls: 'bg-amber-700/40', icon: '🚪' },
  counter: { label: 'Counter / bar', cls: 'bg-amber-800/50', icon: '🍸' },
  kitchen: { label: 'Kitchen', cls: 'bg-orange-500/20', icon: '🍳' },
  cashier: { label: 'Cashier', cls: 'bg-indigo-500/20', icon: '💰' },
  stage: { label: 'Stage', cls: 'bg-violet-500/25', icon: '🎤' },
  restroom: { label: 'Restroom', cls: 'bg-cyan-500/15', icon: '🚻' },
  plant: { label: 'Plant', cls: '', icon: '🪴' },
  umbrella: { label: 'Umbrella', cls: '', icon: '⛱️' },
};

const STATE = {
  design: { body: 'border-indigo-400/60 bg-slate-700/90 text-slate-100', chair: 'bg-slate-500' },
  invalid: { body: 'border-rose-500 bg-rose-500/40 text-slate-50', chair: 'bg-rose-400' },
  nocard: { body: 'border-dashed border-slate-500 bg-slate-800/70 text-slate-400', chair: 'bg-slate-600' },
  free: { body: 'border-emerald-500/70 bg-emerald-500/15 text-slate-100', chair: 'bg-emerald-500/60' },
  busy: { body: 'border-amber-400 bg-amber-500/30 text-slate-50', chair: 'bg-amber-400/80' },
  waiter: { body: 'border-rose-400 bg-rose-500/35 text-slate-50', chair: 'bg-rose-400', ring: '#f43f5e' },
  bill: { body: 'border-violet-400 bg-violet-500/35 text-slate-50', chair: 'bg-violet-400', ring: '#8b5cf6' },
};

export const CALL_META = {
  waiter: { label: 'Call waiter', short: 'Waiter', icon: BellRing, emoji: '🔔', cls: 'text-rose-400', bg: 'bg-rose-500/15' },
  bill: { label: 'Bill please', short: 'Bill', icon: ReceiptText, emoji: '🧾', cls: 'text-violet-400', bg: 'bg-violet-500/15' },
};

const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.00$/, ''));
export const minutesSince = (d) => Math.max(0, Math.floor((Date.now() - new Date(d)) / 60000));

// Re-render every so often so "waiting 3 min" labels stay current.
export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// Areas, tables and active buzzer calls, kept live over the socket.
export function useFloorData() {
  const [floor, setFloor] = useState({ areas: [], tables: [], loaded: false });
  const [calls, setCalls] = useState([]);
  const loadFloor = useCallback(() => api('/floor').then((d) => setFloor({ ...d, loaded: true })).catch(() => {}), []);
  const loadCalls = useCallback(() => api('/calls').then(setCalls).catch(() => {}), []);
  useEffect(() => {
    loadFloor();
    loadCalls();
    const s = getSocket();
    s.on('floor:changed', loadFloor);
    s.on('tabs:changed', loadFloor); // card names and links change with tabs/cards
    s.on('calls:changed', loadCalls);
    s.on('connect', loadCalls);
    return () => {
      s.off('floor:changed', loadFloor);
      s.off('tabs:changed', loadFloor);
      s.off('calls:changed', loadCalls);
      s.off('connect', loadCalls);
    };
  }, [loadFloor, loadCalls]);
  return { ...floor, calls, setFloor, reloadFloor: loadFloor, reloadCalls: loadCalls };
}

let audio;
// A short two- or three-note chime; the bill sounds different from a waiter call.
export function playChime(type = 'waiter') {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const notes = type === 'bill' ? [784, 988, 1319] : [988, 784, 988];
    notes.forEach((freq, i) => {
      const t = audio.currentTime + i * 0.17;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  } catch {
    /* no audio output */
  }
}

// What a table shows on the live plan: a call beats an open tab, which beats free.
export function tableState(table, tabByCard, callsByTable) {
  const calls = callsByTable.get(table._id) ?? [];
  const tab = table.card ? tabByCard.get(String(table.card._id)) : null;
  const bill = calls.find((c) => c.type === 'bill');
  const waiter = calls.find((c) => c.type === 'waiter');
  const call = bill ?? waiter;
  if (call) return { kind: call.type, call, calls, tab };
  if (!table.card || !table.card.active) return { kind: 'nocard', calls, tab };
  return { kind: tab ? 'busy' : 'free', calls, tab };
}

export function useFloorMaps(tabs, calls) {
  return useMemo(() => {
    const tabByCard = new Map(tabs.map((t) => [String(t.card), t]));
    const callsByTable = new Map();
    for (const c of calls) callsByTable.set(String(c.table), [...(callsByTable.get(String(c.table)) ?? []), c]);
    return { tabByCard, callsByTable };
  }, [tabs, calls]);
}

// Chair positions around the table, in % of the table's cell box. Guests are spread evenly by angle from
// the top; on rectangular tables each chair is then pushed out to the nearest edge.
function chairSpots(seats, w, h, round) {
  const n = Math.min(seats, 16);
  const pad = 0.17;
  const off = pad * 0.55;
  const hw = w / 2 - pad;
  const hh = h / 2 - pad;
  const pts = [];
  if (round) {
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n - Math.PI / 2;
      pts.push([w / 2 + (hw + off) * Math.cos(a), h / 2 + (hh + off) * Math.sin(a)]);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n - Math.PI / 2;
      const [dx, dy] = [Math.cos(a), Math.sin(a)];
      const tx = Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity;
      const ty = Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity;
      const t = Math.min(tx, ty);
      const side = tx < ty ? [Math.sign(dx) * off, 0] : [0, Math.sign(dy) * off];
      pts.push([w / 2 + t * dx + side[0], h / 2 + t * dy + side[1]]);
    }
  }
  return pts.map(([x, y]) => ({ left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%` }));
}

export function TableShape({ table, state, sub, selected, lifted, preview, title, onPointerDown, onClick }) {
  const style = STATE[state.kind] ?? STATE.free;
  const round = table.shape === 'round';
  const pos = preview ?? table;
  const chairs = useMemo(() => chairSpots(table.seats, table.w, table.h, round), [table.seats, table.w, table.h, round]);
  const calling = state.kind === 'waiter' || state.kind === 'bill';
  return (
    <div
      className="relative"
      style={{ gridColumn: `${pos.x + 1} / span ${table.w}`, gridRow: `${pos.y + 1} / span ${table.h}`, padding: 'calc(var(--cell) * 0.17)', zIndex: lifted ? 30 : 10, opacity: lifted ? 0.85 : 1 }}
    >
      {chairs.map((c, i) => (
        <span key={i} className={`pointer-events-none absolute rounded-full ${style.chair}`} style={{ ...c, width: 'calc(var(--cell) * 0.15)', height: 'calc(var(--cell) * 0.15)', transform: 'translate(-50%, -50%)' }} />
      ))}
      <button
        type="button"
        title={title}
        onPointerDown={onPointerDown}
        onClick={onClick}
        className={`relative flex h-full w-full touch-none flex-col items-center justify-center overflow-hidden border-2 leading-tight shadow-lg transition-[filter,transform] hover:brightness-125 active:scale-95 ${round ? 'rounded-full' : 'rounded-[calc(var(--cell)*0.12)]'} ${style.body} ${calling ? 'floor-calling' : ''} ${selected ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900' : ''} ${lifted ? 'scale-105 shadow-2xl' : ''}`}
        style={{ '--ring': style.ring }}
      >
        <span className="floor-label max-w-full truncate px-0.5 font-black">{table.name}</span>
        {sub && <span className="floor-sub max-w-full truncate px-0.5 font-semibold tabular-nums opacity-90">{sub}</span>}
      </button>
      {calling && (
        <span className="pointer-events-none absolute right-0 top-0 grid place-items-center rounded-full bg-slate-950 shadow-lg ring-2" style={{ width: 'calc(var(--cell) * 0.4)', height: 'calc(var(--cell) * 0.4)', fontSize: 'calc(var(--cell) * 0.24)', '--tw-ring-color': style.ring }}>
          {state.calls.length > 1 ? `${state.calls.length}` : CALL_META[state.kind].emoji}
        </span>
      )}
    </div>
  );
}

export function DecorCell({ item }) {
  const d = DECOR[item.type];
  if (!d) return null;
  return (
    <div className={`pointer-events-none grid place-items-center ${d.cls}`} style={{ gridColumn: item.x + 1, gridRow: item.y + 1 }}>
      {d.glass && <span className="h-full w-full rounded-sm bg-sky-300/70" />}
      {d.icon && <span className="floor-icon">{d.icon}</span>}
    </div>
  );
}

// The plan itself: a grid sized to fit `maxHeight`, with the area's fixtures. Tables are passed as children.
export function FloorCanvas({ area, decor = area.decor, maxHeight = '65vh', canvasRef, className = '', children, ...handlers }) {
  return (
    <div className="floor-wrap mx-auto" style={{ width: `min(100%, calc(${maxHeight} * ${area.cols} / ${area.rows}))` }}>
      <div
        ref={canvasRef}
        {...handlers}
        className={`floor ${area.kind === 'outdoor' ? 'floor-outdoor' : 'floor-indoor'} overflow-hidden rounded-2xl ring-1 ring-white/10 ${className}`}
        style={{ '--cols': area.cols, '--rows': area.rows }}
      >
        {(decor ?? []).map((d) => <DecorCell key={`${d.x},${d.y}`} item={d} />)}
        {children}
      </div>
    </div>
  );
}

export const AreaIcon = ({ kind, size = 16 }) => (kind === 'outdoor' ? <Trees size={size} /> : <House size={size} />);

export function AreaTabs({ areas, value, onChange, badges, children }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {areas.map((a) => (
        <button
          key={a._id}
          onClick={() => onChange(a._id)}
          className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${value === a._id ? 'bg-indigo-500 text-on-accent' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
        >
          <AreaIcon kind={a.kind} />
          {a.name}
          <span className="text-xs font-normal opacity-70">{a.cols}×{a.rows}</span>
          {badges?.get(a._id) > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 animate-pulse place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{badges.get(a._id)}</span>}
        </button>
      ))}
      {children}
    </div>
  );
}

export function FloorLegend() {
  const items = [
    ['free', 'Free'],
    ['busy', 'Seated (open tab)'],
    ['waiter', 'Calling waiter'],
    ['bill', 'Wants the bill'],
    ['nocard', 'No card linked'],
  ];
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
      {items.map(([k, label]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded border-2 ${STATE[k].body}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

// Live plan: table colours follow open tabs and buzzer calls.
export function FloorLive({ areas, tables, tabs, calls, onTableClick, selectedId, maxHeight, extraTabs, areaId: controlledArea, onAreaChange }) {
  const { money } = useSettings();
  useNow(30000);
  const [ownArea, setOwnArea] = useState(null);
  const areaId = controlledArea ?? ownArea;
  const setAreaId = onAreaChange ?? setOwnArea;
  const { tabByCard, callsByTable } = useFloorMaps(tabs, calls);
  const area = areas.find((a) => a._id === areaId) ?? areas[0];
  const badges = useMemo(() => {
    const m = new Map();
    for (const c of calls) m.set(String(c.area), (m.get(String(c.area)) ?? 0) + 1);
    return m;
  }, [calls]);

  if (!area) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-slate-500">
        <LayoutGrid size={40} strokeWidth={1.5} />
        <p className="text-sm">No floor plan yet. An admin can draw the rooms and tables under Admin → Floor Plan.</p>
      </div>
    );
  }

  return (
    <div>
      <AreaTabs areas={areas} value={area._id} onChange={setAreaId} badges={badges}>{extraTabs}</AreaTabs>
      <FloorCanvas area={area} maxHeight={maxHeight}>
        {tables
          .filter((t) => String(t.area) === area._id)
          .map((t) => {
            const state = tableState(t, tabByCard, callsByTable);
            // One-cell tables only have room for a few characters.
            const small = t.w * t.h === 1;
            const sub = state.call
              ? small
                ? `${minutesSince(state.call.createdAt)}m`
                : `${CALL_META[state.call.type].short} · ${minutesSince(state.call.createdAt)}m`
              : state.tab
                ? small
                  ? compact(tabSubtotal(state.tab))
                  : money(tabSubtotal(state.tab))
                : state.kind === 'nocard'
                  ? 'No card'
                  : t.w > 1
                    ? `${t.seats} seats`
                    : null;
            const title = [
              t.name,
              state.tab && `${state.tab.guests} guest(s) · ${money(tabSubtotal(state.tab))} · ${minutesSince(state.tab.createdAt)} min`,
              ...state.calls.map((c) => `${CALL_META[c.type].label} · waiting ${minutesSince(c.createdAt)} min`),
            ]
              .filter(Boolean)
              .join('\n');
            return <TableShape key={t._id} table={t} state={state} sub={sub} title={title} selected={selectedId === t._id} onClick={() => onTableClick?.(t, state)} />;
          })}
      </FloorCanvas>
      <FloorLegend />
    </div>
  );
}

// Active calls, oldest first, with "On my way" and "Done" for staff.
export function CallsPanel({ calls, onOpenTable, empty = 'No one is calling. Calls from table buzzers appear here.' }) {
  const toast = useToast();
  useNow(15000);
  const [busy, setBusy] = useState(null);
  const act = async (call, what) => {
    setBusy(call._id);
    try {
      await api(`/calls/${call._id}/${what}`, { method: 'POST' });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!calls.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
        <BellRing size={28} strokeWidth={1.5} />
        {empty}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {calls.map((c) => {
        const meta = CALL_META[c.type];
        const wait = minutesSince(c.createdAt);
        return (
          <div key={c._id} className={`rounded-2xl border p-3 ${c.status === 'open' ? 'border-rose-400/40 bg-rose-500/5' : 'border-white/5 bg-slate-800/40'} ${busy === c._id ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${meta.bg} ${meta.cls} ${c.status === 'open' ? 'animate-pulse' : ''}`}><meta.icon size={20} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{c.tableName} <span className="text-xs font-normal text-slate-400">· {c.areaName}</span></div>
                <div className="text-xs text-slate-400">
                  <span className={`font-semibold ${meta.cls}`}>{meta.label}</span> · {wait < 1 ? 'just now' : `${wait} min`}
                  {c.presses > 1 && <span className="ml-1 font-semibold text-amber-300">· pressed {c.presses}×</span>}
                </div>
                {c.status === 'ack' && <div className="text-xs text-emerald-400">{c.ackBy} is on the way</div>}
              </div>
            </div>
            <div className="mt-2 flex gap-2 whitespace-nowrap">
              {c.status === 'open' && <button disabled={!!busy} onClick={() => act(c, 'ack')} className="btn btn-ghost flex-1 px-2 py-1.5 text-xs"><Footprints size={14} /> On my way</button>}
              {c.type === 'bill' && onOpenTable && <button onClick={() => onOpenTable(c)} className="btn btn-ghost flex-1 px-2 py-1.5 text-xs"><ReceiptText size={14} /> Open bill</button>}
              <button disabled={!!busy} onClick={() => act(c, 'done')} className="btn btn-success flex-1 px-2 py-1.5 text-xs"><Check size={14} /> Done</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// POS: the live plan next to the call list. Tapping a table loads (or opens) its tab.
export function FloorModal({ open, onClose, floor, tabs, onTableClick }) {
  const openTable = (call) => {
    const t = floor.tables.find((x) => x._id === String(call.table));
    if (t) onTableClick(t);
  };
  return (
    <Modal open={open} onClose={onClose} title="Floor plan" width="max-w-7xl">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <FloorLive areas={floor.areas} tables={floor.tables} tabs={tabs} calls={floor.calls} onTableClick={onTableClick} maxHeight="68vh" />
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Calls ({floor.calls.length})</h4>
          </div>
          <CallsPanel calls={floor.calls} onOpenTable={openTable} />
          <p className="mt-3 text-xs text-slate-500">Tap a table to open its tab. Paying or cancelling a tab also clears its calls.</p>
        </div>
      </div>
    </Modal>
  );
}
