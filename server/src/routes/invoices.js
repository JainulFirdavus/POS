

import { Router } from 'express';
import { Invoice, Product, getSettings } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, escapeRegex } from '../utils.js';
import { priceSale, releaseStock, reserveStock, resolveItems, saveInvoice } from '../sales.js';
import { afterSale } from '../hardware.js';

const r = Router();
r.use(auth);

function notify(req) {
  const io = req.app.get('io');
  io.emit('products:changed');
  io.emit('invoices:changed');
}

r.post('/', async (req, res) => {
  const { items, discount = 0, paymentMethod = 'cash', paid } = req.body ?? {};
  const settings = await getSettings();
  const orderType = req.body?.orderType ?? settings.defaultOrderType;
  if (!['dine-in', 'takeaway'].includes(orderType)) throw new HttpError(400, 'Invalid order type');
  const lines = await resolveItems(items);
  const pricing = priceSale(lines, { discount, paymentMethod, paid }, settings);
  await reserveStock(lines);
  let invoice;
  try {
    invoice = await saveInvoice(lines, pricing, { user: req.user, orderType });
  } catch (e) {
    await releaseStock(lines);
    throw e;
  }
  notify(req);
  const hardware = await afterSale(req.app.get('io'), invoice, req.user);
  res.status(201).json({ ...invoice.toJSON(), hardware });
});

r.get('/', async (req, res) => {
  const filter = {};
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  if (from && !isNaN(from)) filter.createdAt = { ...filter.createdAt, $gte: from };
  if (to && !isNaN(to)) filter.createdAt = { ...filter.createdAt, $lte: to };
  if (req.query.q) filter.number = { $regex: escapeRegex(String(req.query.q).slice(0, 40)), $options: 'i' };
  if (req.user.role !== 'admin') filter['cashier.id'] = req.user.id;
  res.json(await Invoice.find(filter).sort({ createdAt: -1 }).limit(500).lean());
});

r.get('/:id', async (req, res) => {
  const inv = await Invoice.findById(req.params.id).lean();
  if (!inv || (req.user.role !== 'admin' && String(inv.cashier?.id) !== req.user.id)) throw new HttpError(404, 'Invoice not found');
  res.json(inv);
});

r.post('/:id/void', adminOnly, async (req, res) => {
  const inv = await Invoice.findOneAndUpdate(
    { _id: req.params.id, status: 'paid' },
    { status: 'void', voidedAt: new Date(), voidedBy: req.user.name },
    { new: true },
  );
  if (!inv) throw new HttpError(404, 'Invoice not found or already void');
  await Promise.all(inv.items.filter((l) => l.product).map((l) => Product.updateOne({ _id: l.product }, { $inc: { stock: l.qty } })));
  notify(req);
  res.json(inv);
});

export default r;
 