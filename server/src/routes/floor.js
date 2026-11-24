import crypto from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import { AREA_KINDS, DECOR_TYPES, DiningTable, FloorArea, GRID_MAX, GRID_MIN, RfidCard, Tab } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, escapeRegex } from '../utils.js';
import { finishCalls, normDevice } from '../calls.js';

const r = Router();
r.use(auth);

const CARD_FIELDS = 'uid label color active virtual';
const changed = (req, { cards = false, calls = false } = {}) => {
  const io = req.app.get('io');
  io.emit('floor:changed');
  if (cards) io.emit('tabs:changed');
  if (calls) io.emit('calls:changed');
};
const int = (v, min, max) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) throw new HttpError(400, 'Invalid number');
  return Math.min(max, Math.max(min, n));
};
const fits = (t, area) => t.x >= 0 && t.y >= 0 && t.x + t.w <= area.cols && t.y + t.h <= area.rows;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function findOr404(Model, id, what) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, `${what} not found`);
  const doc = await Model.findById(id);
  if (!doc) throw new HttpError(404, `${what} not found`);
  return doc;
}

function cleanDecor(list, cols, rows) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Invalid fixtures');
  const byCell = new Map();
  for (const it of list.slice(0, GRID_MAX * GRID_MAX * 2)) {
    const x = Math.floor(Number(it?.x));
    const y = Math.floor(Number(it?.y));
    if (DECOR_TYPES.includes(it?.type) && x >= 0 && x < cols && y >= 0 && y < rows) byCell.set(`${x},${y}`, { x, y, type: it.type });
  }
  return [...byCell.values()];
}

async function hasOpenTab(cardIds) {
  const ids = cardIds.filter(Boolean);
  return ids.length ? Tab.findOne({ card: { $in: ids }, status: 'open' }).select('label').lean() : null;
}

// Virtual cards exist only for their table, so they go when the table goes.
async function removeVirtualCards(cardIds) {
  const ids = cardIds.filter(Boolean);
  if (ids.length) await RfidCard.deleteMany({ _id: { $in: ids }, virtual: true });
}

const newVirtualCard = (label) => RfidCard.create({ uid: `FT${crypto.randomBytes(5).toString('hex').toUpperCase()}`, label, color: '#10b981', virtual: true });

r.get('/', async (_req, res) => {
  const [areas, tables] = await Promise.all([
    FloorArea.find().sort({ order: 1, createdAt: 1 }).lean(),
    DiningTable.find().populate('card', CARD_FIELDS).lean(),
  ]);
  res.json({ areas, tables });
});

// ---- Areas ----
r.post('/areas', adminOnly, async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 40);
  if (!name) throw new HttpError(400, 'Give the area a name');
  const kind = AREA_KINDS.includes(req.body?.kind) ? req.body.kind : 'indoor';
  const cols = int(req.body?.cols ?? 10, GRID_MIN, GRID_MAX);
  const rows = int(req.body?.rows ?? 10, GRID_MIN, GRID_MAX);
  const area = await FloorArea.create({ name, kind, cols, rows, decor: cleanDecor(req.body?.decor ?? [], cols, rows), order: await FloorArea.countDocuments() });
  changed(req);
  res.status(201).json(area);
});

r.put('/areas/:id', adminOnly, async (req, res) => {
  const area = await findOr404(FloorArea, req.params.id, 'Area');
  const b = req.body ?? {};
  if (b.name !== undefined) {
    area.name = String(b.name).trim().slice(0, 40);
    if (!area.name) throw new HttpError(400, 'Give the area a name');
  }
  if (b.kind !== undefined) {
    if (!AREA_KINDS.includes(b.kind)) throw new HttpError(400, 'Invalid area type');
    area.kind = b.kind;
  }
  if (b.order !== undefined) area.order = int(b.order, 0, 1000);
  if (b.cols !== undefined || b.rows !== undefined) {
    const size = { cols: b.cols !== undefined ? int(b.cols, GRID_MIN, GRID_MAX) : area.cols, rows: b.rows !== undefined ? int(b.rows, GRID_MIN, GRID_MAX) : area.rows };
    const outside = (await DiningTable.find({ area: area._id }).lean()).filter((t) => !fits(t, size));
    if (outside.length) throw new HttpError(409, `Move ${outside.map((t) => t.name).join(', ')} first: ${outside.length > 1 ? 'they' : 'it'} would be outside the smaller area`);
    Object.assign(area, size);
  }
  area.decor = cleanDecor(b.decor !== undefined ? b.decor : area.decor, area.cols, area.rows);
  await area.save();
  changed(req);
  res.json(area);
});

r.delete('/areas/:id', adminOnly, async (req, res) => {
  const area = await findOr404(FloorArea, req.params.id, 'Area');
  const tables = await DiningTable.find({ area: area._id }).lean();
  const cards = tables.map((t) => t.card);
  const busy = await hasOpenTab(cards);
  if (busy) throw new HttpError(409, `${busy.label} still has an open tab in this area`);
  await DiningTable.deleteMany({ area: area._id });
  await removeVirtualCards(cards);
  await finishCalls(req.app.get('io'), { table: { $in: tables.map((t) => t._id) } }, req.user.name, 'cancelled');
  await area.deleteOne();
  changed(req, { cards: true });
  res.json({ ok: true });
});

// Places every registered card that is not on the floor yet, leaving an aisle between tables.
r.post('/areas/:id/auto-place', adminOnly, async (req, res) => {
  const area = await findOr404(FloorArea, req.params.id, 'Area');
  const [cards, placed] = await Promise.all([RfidCard.find({ active: true }).lean(), DiningTable.find().select('area name card x y w h').lean()]);
  const linked = new Set(placed.map((t) => String(t.card)));
  const todo = cards.filter((c) => !linked.has(String(c._id))).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  if (!todo.length) throw new HttpError(400, 'Every card already has a table');

  const blocked = new Set(area.decor.map((d) => `${d.x},${d.y}`));
  const here = placed.filter((t) => String(t.area) === String(area._id));
  const names = new Set(placed.map((t) => t.name.toLowerCase()));
  const free = (x, y) => !blocked.has(`${x},${y}`) && !here.some((t) => overlaps(t, { x, y, w: 1, h: 1 }));
  const spots = [];
  for (const step of [2, 1]) {
    for (let y = 1; y < area.rows - 1; y += step) for (let x = 1; x < area.cols - 1; x += step) if (free(x, y) && !spots.some((s) => s.x === x && s.y === y)) spots.push({ x, y });
  }

  const created = [];
  for (const card of todo) {
    const spot = spots.shift();
    if (!spot) break;
    let name = card.label.slice(0, 20);
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${card.label.slice(0, 16)} (${n})`;
    names.add(name.toLowerCase());
    const t = await DiningTable.create({ area: area._id, name, ...spot, card: card._id });
    here.push(t);
    created.push(t);
  }
  changed(req);
  res.json({ placed: created.length, left: todo.length - created.length });
});

// ---- Tables ----
async function applyTable(table, b, area) {
  if (b.name !== undefined) table.name = String(b.name).trim().slice(0, 20);
  if (b.shape !== undefined) table.shape = b.shape === 'round' ? 'round' : 'square';
  if (b.seats !== undefined) table.seats = int(b.seats, 1, 30);
  for (const k of ['x', 'y']) if (b[k] !== undefined) table[k] = int(b[k], 0, GRID_MAX);
  for (const k of ['w', 'h']) if (b[k] !== undefined) table[k] = int(b[k], 1, 6);
  if (b.buzzer !== undefined) {
    const device = normDevice(b.buzzer);
    if (device) {
      const other = await DiningTable.findOne({ buzzer: device, _id: { $ne: table._id } }).select('name').lean();
      if (other) throw new HttpError(409, `Buzzer ${device} is already on ${other.name}`);
    }
    table.buzzer = device || undefined;
  }
  if (!table.name) throw new HttpError(400, 'Give the table a name');
  const dup = await DiningTable.findOne({ name: new RegExp(`^${escapeRegex(table.name)}$`, 'i'), _id: { $ne: table._id } }).select('_id').lean();
  if (dup) throw new HttpError(409, `There is already a table called ${table.name}`);
  if (!fits(table, area)) throw new HttpError(400, 'The table does not fit inside this area');
  const others = await DiningTable.find({ area: area._id, _id: { $ne: table._id } }).select('name x y w h').lean();
  const hit = others.find((o) => overlaps(table, o));
  if (hit) throw new HttpError(409, `That spot overlaps ${hit.name}`);
}

// Card to link: an existing card id, or "new"/null for a virtual card named after the table.
async function pickCard(cardId, table) {
  if (cardId && cardId !== 'new') {
    if (!mongoose.isValidObjectId(cardId)) throw new HttpError(400, 'Invalid card');
    const card = await RfidCard.findById(cardId).lean();
    if (!card) throw new HttpError(404, 'Card not found');
    const other = await DiningTable.findOne({ card: card._id, _id: { $ne: table._id } }).select('name').lean();
    if (other) throw new HttpError(409, `${card.label} is already linked to ${other.name}`);
    return { id: card._id, created: false };
  }
  return { id: (await newVirtualCard(table.name))._id, created: true };
}

r.post('/tables', adminOnly, async (req, res) => {
  const area = await findOr404(FloorArea, req.body?.area, 'Area');
  const table = new DiningTable({ area: area._id });
  await applyTable(table, req.body ?? {}, area);
  const card = await pickCard(req.body?.cardId, table);
  table.card = card.id;
  try {
    await table.save();
  } catch (e) {
    if (card.created) await removeVirtualCards([card.id]);
    throw e;
  }
  changed(req, { cards: card.created });
  res.status(201).json(await DiningTable.findById(table._id).populate('card', CARD_FIELDS).lean());
});

r.put('/tables/:id', adminOnly, async (req, res) => {
  const table = await findOr404(DiningTable, req.params.id, 'Table');
  const b = req.body ?? {};
  // Moving a table to another area.
  const area = b.area && String(b.area) !== String(table.area) ? await findOr404(FloorArea, b.area, 'Area') : await findOr404(FloorArea, table.area, 'Area');
  table.area = area._id;
  const renamed = b.name !== undefined && String(b.name).trim() !== table.name;
  await applyTable(table, b, area);

  const oldCard = table.card ? await RfidCard.findById(table.card).lean() : null;
  let newCard = null;
  if (b.cardId !== undefined && String(b.cardId) !== String(table.card ?? '')) {
    if (oldCard && (await hasOpenTab([oldCard._id]))) throw new HttpError(409, `Close ${oldCard.label}'s open tab before changing the card`);
    newCard = await pickCard(b.cardId, table);
    table.card = newCard.id;
  }
  try {
    await table.save();
  } catch (e) {
    if (newCard?.created) await removeVirtualCards([newCard.id]);
    throw e;
  }
  if (newCard && oldCard?.virtual) await removeVirtualCards([oldCard._id]);
  // A virtual card carries the table's name onto its tabs and receipts.
  if (renamed && !newCard && oldCard?.virtual) {
    await RfidCard.updateOne({ _id: oldCard._id }, { label: table.name });
    await Tab.updateMany({ card: oldCard._id, status: 'open' }, { label: table.name });
  }
  changed(req, { cards: !!newCard || renamed });
  res.json(await DiningTable.findById(table._id).populate('card', CARD_FIELDS).lean());
});

r.delete('/tables/:id', adminOnly, async (req, res) => {
  const table = await findOr404(DiningTable, req.params.id, 'Table');
  const busy = await hasOpenTab([table.card]);
  if (busy) throw new HttpError(409, `${busy.label} has an open tab. Close it first.`);
  await table.deleteOne();
  await removeVirtualCards([table.card]);
  await finishCalls(req.app.get('io'), { table: table._id }, req.user.name, 'cancelled');
  changed(req, { cards: true });
  res.json({ ok: true });
});

export default r;
