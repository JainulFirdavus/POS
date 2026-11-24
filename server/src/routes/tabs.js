import { Router } from 'express';
import mongoose from 'mongoose';
import { RfidCard, Tab, getSettings } from '../models.js';
import { auth } from '../middleware/auth.js';
import { HttpError, round2 } from '../utils.js';
import { priceSale, releaseStock, reserveStock, resolveItems, saveInvoice } from '../sales.js';
import { afterSale } from '../hardware.js';
import { normUid } from './rfid.js';
import { finishCallsForCard } from '../calls.js';

const r = Router();
r.use(auth);

const changed = (req, stock = false) => {
  const io = req.app.get('io');
  io.emit('tabs:changed');
  if (stock) io.emit('products:changed');
};

async function openTabOr404(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Tab not found');
  const tab = await Tab.findOne({ _id: id, status: 'open' });
  if (!tab) throw new HttpError(404, 'This tab is closed or does not exist');
  return tab;
}

// Same products added in separate rounds are merged into one invoice line.
function invoiceLines(items) {
  const byKey = new Map();
  for (const it of items) {
    const key = it.product ? `p:${it.product}:${it.price}` : `c:${it.name}:${it.price}`;
    const line = byKey.get(key);
    if (line) {
      line.qty += it.qty;
      line.total = round2(line.price * line.qty);
    } else {
      byKey.set(key, { product: it.product, name: it.name, sku: it.sku, category: it.category, qty: it.qty, price: it.price, cost: it.cost, total: round2(it.price * it.qty) });
    }
  }
  return [...byKey.values()];
}

r.get('/', async (req, res) => {
  if (req.query.status === 'closed') {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Admin access required');
    return res.json(await Tab.find({ status: { $in: ['closed', 'cancelled', 'merged'] } }).sort({ updatedAt: -1 }).limit(100).lean());
  }
  res.json(await Tab.find({ status: 'open' }).sort({ createdAt: 1 }).lean());
});

r.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Tab not found');
  const tab = await Tab.findById(req.params.id).lean();
  if (!tab) throw new HttpError(404, 'Tab not found');
  res.json(tab);
});

r.post('/', async (req, res) => {
  const card = await RfidCard.findOne({ uid: normUid(req.body?.uid) });
  if (!card) throw new HttpError(404, 'This card is not registered');
  if (!card.active) throw new HttpError(400, `${card.label} is disabled`);
  const guests = Math.min(Math.max(Math.floor(Number(req.body?.guests) || 1), 1), 99);
  try {
    const tab = await Tab.create({
      card: card._id,
      cardUid: card.uid,
      label: card.label,
      color: card.color,
      guests,
      note: String(req.body?.note ?? '').trim().slice(0, 160) || undefined,
      openedBy: { id: req.user.id, name: req.user.name },
    });
    changed(req);
    res.status(201).json(tab);
  } catch (e) {
    if (e.code === 11000) throw new HttpError(409, `${card.label} already has an open tab`);
    throw e;
  }
});

// Adds a round of orders. Stock is taken now (the kitchen is about to use it) and given back if items are removed or the tab is cancelled.
r.post('/:id/items', async (req, res) => {
  await openTabOr404(req.params.id);
  const lines = await resolveItems(req.body?.items);
  await reserveStock(lines);
  const now = new Date();
  const items = lines.map((l) => ({ ...l, custom: !!l.custom, addedBy: req.user.name, addedAt: now }));
  const tab = await Tab.findOneAndUpdate({ _id: req.params.id, status: 'open' }, { $push: { items: { $each: items } } }, { new: true });
  if (!tab) {
    await releaseStock(lines);
    throw new HttpError(409, 'This tab was closed while adding items');
  }
  changed(req, true);
  res.json(tab);
});

r.patch('/:id/items/:itemId', async (req, res) => {
  const tab = await openTabOr404(req.params.id);
  const item = tab.items.id(req.params.itemId);
  if (!item) throw new HttpError(404, 'Item not found on this tab');
  const qty = Math.floor(Number(req.body?.qty));
  if (!(qty >= 0 && qty <= 10000)) throw new HttpError(400, 'Invalid quantity');
  const delta = qty - item.qty;
  if (delta === 0) return res.json(tab);
  const stockLine = item.product ? [{ product: item.product, name: item.name, qty: Math.abs(delta) }] : [];
  if (delta > 0) await reserveStock(stockLine);

  const update = qty === 0 ? { $pull: { items: { _id: item._id } } } : { $set: { 'items.$.qty': qty } };
  const updated = await Tab.findOneAndUpdate({ _id: tab._id, status: 'open', items: { $elemMatch: { _id: item._id, qty: item.qty } } }, update, { new: true });
  if (!updated) {
    if (delta > 0) await releaseStock(stockLine);
    throw new HttpError(409, 'The tab changed meanwhile, please try again');
  }
  if (delta < 0) await releaseStock(stockLine);
  changed(req, !!stockLine.length);
  res.json(updated);
});

r.post('/:id/checkout', async (req, res) => {
  const tab = await openTabOr404(req.params.id);
  if (!tab.items.length) throw new HttpError(400, 'This tab has no items. Cancel it instead.');
  const settings = await getSettings();
  const lines = invoiceLines(tab.items);
  const pricing = priceSale(lines, req.body ?? {}, settings);

  // Lock the tab first so two registers can never charge it twice; the updatedAt guard also rejects items added after pricing.
  const locked = await Tab.findOneAndUpdate(
    { _id: tab._id, status: 'open', updatedAt: tab.updatedAt },
    { status: 'closed', closedAt: new Date(), closedBy: req.user.name },
    { new: true, timestamps: false },
  );
  if (!locked) throw new HttpError(409, 'The tab changed meanwhile, please review and pay again');

  let invoice;
  try {
    // Stock was already taken when each round was ordered.
    invoice = await saveInvoice(lines, pricing, { user: req.user, orderType: 'dine-in', tab: tab._id, table: tab.label });
  } catch (e) {
    await Tab.updateOne({ _id: tab._id }, { status: 'open', $unset: { closedAt: 1, closedBy: 1 } });
    throw e;
  }
  await Tab.updateOne({ _id: tab._id }, { invoice: invoice._id });
  const io = req.app.get('io');
  io.emit('invoices:changed');
  changed(req);
  await finishCallsForCard(io, tab.card, req.user.name);
  const hardware = await afterSale(io, invoice, req.user);
  res.status(201).json({ ...invoice.toJSON(), hardware });
});

// Cancelling returns the reserved stock. Cashiers may only cancel empty tabs (e.g. a card tapped by mistake).
r.post('/:id/cancel', async (req, res) => {
  const tab = await openTabOr404(req.params.id);
  if (tab.items.length && req.user.role !== 'admin') throw new HttpError(403, 'Only an admin can cancel a tab that has orders');
  const cancelled = await Tab.findOneAndUpdate(
    { _id: tab._id, status: 'open' },
    { status: 'cancelled', closedAt: new Date(), closedBy: req.user.name },
    { new: true },
  );
  if (!cancelled) throw new HttpError(409, 'This tab was already closed');
  await releaseStock(cancelled.items);
  changed(req, true);
  await finishCallsForCard(req.app.get('io'), cancelled.card, req.user.name);
  res.json(cancelled);
});

// Copies tab items so they can be pushed onto another tab (stock stays reserved, it just changes tab).
const copyItem = (it, qty, from) => {
  const { _id, ...rest } = it.toObject();
  return { ...rest, qty, from: rest.from || from };
};

// Combine: everything on another card's tab moves onto this tab (e.g. two tables joining). The other card becomes free.
r.post('/:id/merge', async (req, res) => {
  const target = await openTabOr404(req.params.id);
  const source = await openTabOr404(req.body?.fromTabId);
  if (String(source._id) === String(target._id)) throw new HttpError(400, 'Choose a different tab to combine');

  const locked = await Tab.findOneAndUpdate(
    { _id: source._id, status: 'open', updatedAt: source.updatedAt },
    { status: 'merged', mergedInto: target._id, closedAt: new Date(), closedBy: req.user.name },
    { new: true },
  );
  if (!locked) throw new HttpError(409, `${source.label} changed meanwhile, please try again`);
  const items = source.items.map((it) => copyItem(it, it.qty, source.label));
  const updated = await Tab.findOneAndUpdate(
    { _id: target._id, status: 'open' },
    { $push: { items: { $each: items } }, $set: { guests: Math.min(99, target.guests + source.guests) } },
    { new: true },
  );
  if (!updated) {
    await Tab.updateOne({ _id: source._id }, { status: 'open', $unset: { mergedInto: 1, closedAt: 1, closedBy: 1 } });
    throw new HttpError(409, `${target.label} was closed meanwhile`);
  }
  changed(req);
  // The other table's guests moved over, so its calls are moved too: they are now this table's to answer.
  await finishCallsForCard(req.app.get('io'), source.card, req.user.name);
  res.json(updated);
});

// Split: move chosen items (all or part of a quantity) to another card. A free card gets a new tab;
// a card that already has a tab receives the items. If nothing is left, this tab is closed as merged.
r.post('/:id/move', async (req, res) => {
  const source = await openTabOr404(req.params.id);
  const moves = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!moves.length || moves.length > 500) throw new HttpError(400, 'Choose the items to move');
  const qtyById = new Map();
  for (const m of moves) {
    const item = source.items.id(m?.itemId);
    const qty = Math.floor(Number(m?.qty));
    if (!item || !(qty > 0)) throw new HttpError(400, 'Invalid item to move');
    qtyById.set(String(item._id), (qtyById.get(String(item._id)) ?? 0) + qty);
    if (qtyById.get(String(item._id)) > item.qty) throw new HttpError(400, `Only ${item.qty} × ${item.name} on this tab`);
  }

  // Find or open the destination tab.
  let target;
  let created = false;
  if (req.body?.toTabId) {
    target = await openTabOr404(req.body.toTabId);
  } else {
    const card = await RfidCard.findOne({ uid: normUid(req.body?.toUid) });
    if (!card) throw new HttpError(404, 'That card is not registered');
    if (!card.active) throw new HttpError(400, `${card.label} is disabled`);
    target = await Tab.findOne({ card: card._id, status: 'open' });
    if (!target) {
      try {
        target = await Tab.create({ card: card._id, cardUid: card.uid, label: card.label, color: card.color, guests: 1, openedBy: { id: req.user.id, name: req.user.name } });
        created = true;
      } catch (e) {
        if (e.code !== 11000) throw e;
        target = await Tab.findOne({ card: card._id, status: 'open' });
      }
    }
  }
  if (String(target._id) === String(source._id)) throw new HttpError(400, 'Choose a different card to move items to');

  const moved = [];
  const remaining = [];
  for (const it of source.items) {
    const q = qtyById.get(String(it._id)) ?? 0;
    if (q) moved.push(copyItem(it, q, source.label));
    if (it.qty - q > 0) remaining.push({ ...it.toObject(), qty: it.qty - q });
  }
  const emptied = remaining.length === 0;
  const sourceUpdate = emptied
    ? { $set: { items: [], status: 'merged', mergedInto: target._id, closedAt: new Date(), closedBy: req.user.name } }
    : { $set: { items: remaining } };
  const updatedSource = await Tab.findOneAndUpdate({ _id: source._id, status: 'open', updatedAt: source.updatedAt }, sourceUpdate, { new: true });
  if (!updatedSource) {
    if (created) await Tab.updateOne({ _id: target._id, items: { $size: 0 } }, { status: 'cancelled', closedAt: new Date(), closedBy: req.user.name });
    throw new HttpError(409, 'The tab changed meanwhile, please try again');
  }
  const updatedTarget = await Tab.findOneAndUpdate({ _id: target._id, status: 'open' }, { $push: { items: { $each: moved } } }, { new: true });
  if (!updatedTarget) {
    // Destination closed in the meantime: put the items back where they were.
    await Tab.updateOne({ _id: source._id }, { $set: { items: source.items.map((it) => it.toObject()), status: 'open' }, $unset: { mergedInto: 1, closedAt: 1, closedBy: 1 } });
    throw new HttpError(409, `${target.label} was closed meanwhile`);
  }
  changed(req);
  res.json({ source: updatedSource, target: updatedTarget });
});

export default r;
