

import { Router } from 'express';
import { Product } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, pick } from '../utils.js';

const r = Router();
const FIELDS = ['name', 'sku', 'barcode', 'category', 'price', 'cost', 'stock', 'lowStock', 'emoji', 'color', 'favorite', 'active'];
const changed = (req) => req.app.get('io').emit('products:changed');

function body(req) {
  const data = pick(req.body, FIELDS);
  if (data.category === '') data.category = null;
  return data;
}

r.get('/', auth, async (req, res) => {
  const filter = req.query.all === '1' && req.user.role === 'admin' ? {} : { active: true };
  res.json(await Product.find(filter).sort({ favorite: -1, name: 1 }).lean());
});

r.post('/', auth, adminOnly, async (req, res) => {
  const product = await Product.create(body(req));
  changed(req);
  res.status(201).json(product);
});

r.put('/:id', auth, adminOnly, async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, body(req), { new: true, runValidators: true });
  if (!product) throw new HttpError(404, 'Product not found');
  changed(req);
  res.json(product);
});

r.patch('/:id/stock', auth, adminOnly, async (req, res) => {
  const adjust = Math.trunc(Number(req.body?.adjust));
  if (!Number.isFinite(adjust) || adjust === 0) throw new HttpError(400, 'Enter a non-zero quantity');
  const product = await Product.findByIdAndUpdate(req.params.id, { $inc: { stock: adjust } }, { new: true });
  if (!product) throw new HttpError(404, 'Product not found');
  changed(req);
  res.json(product);
});

r.delete('/:id', auth, adminOnly, async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new HttpError(404, 'Product not found');
  changed(req);
  res.json({ ok: true });
});

export default r;
 