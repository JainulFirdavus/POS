import { Router } from 'express';
import { DiningTable, RfidCard, Tab } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError } from '../utils.js';

const r = Router();
r.use(auth);

// USB RFID readers "type" the card number like a keyboard. Different readers add spaces, colons or
// leading zeros in different ways, so only letters and digits are kept.
export const normUid = (uid) => String(uid ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 64);

function cardData(body) {
  const data = {};
  if (body?.uid !== undefined) {
    data.uid = normUid(body.uid);
    if (data.uid.length < 4) throw new HttpError(400, 'Scan the card (the number looks too short)');
  }
  if (body?.label !== undefined) data.label = String(body.label).trim().slice(0, 40);
  if (body?.color !== undefined) data.color = String(body.color).slice(0, 20);
  if (body?.active !== undefined) data.active = !!body.active;
  return data;
}

r.get('/', async (_req, res) => {
  const [cards, tabs, tables] = await Promise.all([
    RfidCard.find().sort({ label: 1 }).lean(),
    Tab.find({ status: 'open' }).select('card').lean(),
    DiningTable.find({ card: { $ne: null } }).select('card name').lean(),
  ]);
  const open = new Map(tabs.map((t) => [String(t.card), String(t._id)]));
  const onTable = new Map(tables.map((t) => [String(t.card), t.name]));
  res.json(cards.map((c) => ({ ...c, openTab: open.get(String(c._id)) ?? null, table: onTable.get(String(c._id)) ?? null })));
});

r.get('/lookup/:uid', async (req, res) => {
  const card = await RfidCard.findOne({ uid: normUid(req.params.uid) }).lean();
  if (!card) throw new HttpError(404, 'This card is not registered');
  const tab = await Tab.findOne({ card: card._id, status: 'open' }).lean();
  res.json({ card, tab });
});

r.post('/', adminOnly, async (req, res) => {
  const data = cardData(req.body);
  if (!data.uid || !data.label) throw new HttpError(400, 'Card number and name are required');
  const card = await RfidCard.create(data);
  req.app.get('io').emit('tabs:changed');
  res.status(201).json(card);
});

r.put('/:id', adminOnly, async (req, res) => {
  const card = await RfidCard.findByIdAndUpdate(req.params.id, cardData(req.body), { new: true, runValidators: true });
  if (!card) throw new HttpError(404, 'Card not found');
  await Tab.updateMany({ card: card._id, status: 'open' }, { label: card.label, color: card.color });
  req.app.get('io').emit('tabs:changed');
  res.json(card);
});

r.delete('/:id', adminOnly, async (req, res) => {
  if (await Tab.exists({ card: req.params.id, status: 'open' })) throw new HttpError(409, 'Close or cancel this card’s open tab first');
  const card = await RfidCard.findByIdAndDelete(req.params.id);
  if (!card) throw new HttpError(404, 'Card not found');
  // Its table stays on the floor plan; the admin can link another card to it.
  await DiningTable.updateMany({ card: card._id }, { card: null });
  req.app.get('io').emit('tabs:changed');
  req.app.get('io').emit('floor:changed');
  res.json({ ok: true });
});

export default r;
