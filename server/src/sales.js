import mongoose from 'mongoose';
import { Counter, Invoice, Product } from './models.js';
import { HttpError, round2, roundTo5Sen } from './utils.js';

export const PAYMENT_METHODS = ['cash', 'card', 'qr'];

export async function nextInvoiceNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const c = await Counter.findOneAndUpdate({ _id: `inv-${ymd}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `INV-${ymd}-${String(c.seq).padStart(4, '0')}`;
}

// Validates cart items from the client and resolves catalogue products to priced lines.
export async function resolveItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new HttpError(400, 'Cart is empty');
  const qtyById = new Map();
  const customLines = [];
  for (const it of items) {
    const qty = Math.floor(Number(it?.qty));
    if (!(qty > 0 && qty <= 10000)) throw new HttpError(400, 'Invalid cart item');
    if (it?.custom === true) {
      const name = String(it.name ?? '').trim();
      const price = Number(it.price);
      if (!name || name.length > 120 || !Number.isFinite(price) || price <= 0 || price > 1000000) throw new HttpError(400, 'Invalid custom item');
      customLines.push({ name, qty, price: round2(price), cost: 0, total: round2(price * qty), custom: true });
      continue;
    }
    if (!mongoose.isValidObjectId(it?.productId)) throw new HttpError(400, 'Invalid cart item');
    const id = String(it.productId);
    qtyById.set(id, (qtyById.get(id) || 0) + qty);
  }

  const products = await Product.find({ _id: { $in: [...qtyById.keys()] }, active: true }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return [...qtyById]
    .map(([id, qty]) => {
      const p = byId.get(id);
      if (!p) throw new HttpError(400, 'A product in the cart is no longer available');
      return { product: p._id, name: p.name, sku: p.sku, category: p.category ?? undefined, emoji: p.emoji, qty, price: p.price, cost: p.cost, total: round2(p.price * qty) };
    })
    .concat(customLines);
}

// Conditional decrement keeps stock from going negative under concurrent sales.
export async function reserveStock(lines) {
  const done = [];
  for (const l of lines) {
    if (!l.product) continue;
    const result = await Product.updateOne({ _id: l.product, stock: { $gte: l.qty } }, { $inc: { stock: -l.qty } });
    if (!result.modifiedCount) {
      await releaseStock(done);
      throw new HttpError(409, `Not enough stock for ${l.name}`);
    }
    done.push(l);
  }
}

export async function releaseStock(lines) {
  await Promise.all(lines.filter((l) => l.product && l.qty > 0).map((l) => Product.updateOne({ _id: l.product }, { $inc: { stock: l.qty } })));
}

export function priceSale(lines, { discount = 0, paymentMethod = 'cash', paid } = {}, settings) {
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new HttpError(400, 'Invalid payment method');
  if (!settings.paymentMethods[paymentMethod]) throw new HttpError(400, 'This payment method is disabled');
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const disc = round2(Math.min(Math.max(Number(discount) || 0, 0), subtotal));
  const tax = round2(((subtotal - disc) * settings.taxRate) / 100);
  const exact = round2(subtotal - disc + tax);
  // Cash bills are rounded to the nearest 5 sen; card and QR are charged the exact amount.
  const total = paymentMethod === 'cash' && settings.cashRounding ? roundTo5Sen(exact) : exact;
  const paidAmount = paymentMethod === 'cash' ? round2(Number(paid)) : total;
  if (!(paidAmount >= total)) throw new HttpError(400, 'Paid amount is less than total');
  return {
    subtotal,
    discount: disc,
    taxRate: settings.taxRate,
    taxLabel: settings.taxLabel,
    tax,
    rounding: round2(total - exact),
    total,
    paymentMethod,
    paid: paidAmount,
    change: round2(paidAmount - total),
  };
}

export async function saveInvoice(lines, pricing, { user, orderType = 'takeaway', tab, table } = {}) {
  return Invoice.create({
    number: await nextInvoiceNumber(),
    items: lines.map(({ product, name, sku, category, qty, price, cost, total }) => ({ product, name, sku, category, qty, price, cost, total })),
    ...pricing,
    cashier: { id: user.id, name: user.name },
    orderType,
    tab,
    table,
  });
}
