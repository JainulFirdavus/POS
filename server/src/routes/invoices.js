

import { Router } from 'express';
import mongoose from 'mongoose';
import { Counter, Invoice, Product, getSettings } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, escapeRegex, round2 } from '../utils.js';

const r = Router();
r.use(auth);

async function nextInvoiceNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const c = await Counter.findOneAndUpdate({ _id: `inv-${ymd}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `INV-${ymd}-${String(c.seq).padStart(4, '0')}`;
}

function notify(req) {
  const io = req.app.get('io');
  io.emit('products:changed');
  io.emit('invoices:changed');
}

r.post('/', async (req, res) => {
  const { items, discount = 0, paymentMethod = 'cash', paid } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new HttpError(400, 'Cart is empty');
  if (!['cash', 'card', 'upi'].includes(paymentMethod)) throw new HttpError(400, 'Invalid payment method');

  const qtyById = new Map();
  const customLines = [];
  for (const it of items) {
    const qty = Math.floor(Number(it?.qty));
    if (!(qty > 0 && qty <= 10000)) throw new HttpError(400, 'Invalid cart item');
    if (it?.custom === true) {
      const name = String(it.name ?? '').trim();
      const price = Number(it.price);
      if (!name || name.length > 120 || !Number.isFinite(price) || price <= 0 || price > 1000000) throw new HttpError(400, 'Invalid custom item');
      customLines.push({ name, qty, price: round2(price), total: round2(price * qty) });
      continue;
    }
    if (!mongoose.isValidObjectId(it?.productId)) throw new HttpError(400, 'Invalid cart item');
    const id = String(it.productId);
    qtyById.set(id, (qtyById.get(id) || 0) + qty);
  }

  const products = await Product.find({ _id: { $in: [...qtyById.keys()] }, active: true }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const lines = [...qtyById].map(([id, qty]) => {
    const p = byId.get(id);
    if (!p) throw new HttpError(400, 'A product in the cart is no longer available');
    return { product: p._id, name: p.name, sku: p.sku, qty, price: p.price, cost: p.cost, total: round2(p.price * qty) };
  }).concat(customLines);

  const settings = await getSettings();
  if (!settings.paymentMethods[paymentMethod]) throw new HttpError(400, 'This payment method is disabled');
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const disc = round2(Math.min(Math.max(Number(discount) || 0, 0), subtotal));
  const tax = round2(((subtotal - disc) * settings.taxRate) / 100);
  const total = round2(subtotal - disc + tax);
  const paidAmount = paymentMethod === 'cash' ? round2(Number(paid)) : total;
  if (!(paidAmount >= total)) throw new HttpError(400, 'Paid amount is less than total');

  // Conditional decrement keeps stock from going negative under concurrent sales.
  const done = [];
  for (const l of lines) {
    if (!l.product) continue;
    const result = await Product.updateOne({ _id: l.product, stock: { $gte: l.qty } }, { $inc: { stock: -l.qty } });
    if (!result.modifiedCount) {
      await Promise.all(done.map((d) => Product.updateOne({ _id: d.product }, { $inc: { stock: d.qty } })));
      throw new HttpError(409, `Not enough stock for ${l.name}`);
    }
    done.push(l);
  }

  const invoice = await Invoice.create({
    number: await nextInvoiceNumber(),
    items: lines,
    subtotal,
    discount: disc,
    taxRate: settings.taxRate,
    tax,
    total,
    paymentMethod,
    paid: paidAmount,
    change: round2(paidAmount - total),
    cashier: { id: req.user.id, name: req.user.name },
  });
  notify(req);
  res.status(201).json(invoice);
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
 