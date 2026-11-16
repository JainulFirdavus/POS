


import { Router } from 'express';
import { Category, Product } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, pick } from '../utils.js';

const r = Router();
const FIELDS = ['name', 'emoji', 'color', 'order'];
const changed = (req) => req.app.get('io').emit('products:changed');

r.get('/', auth, async (_req, res) => {
  res.json(await Category.find().sort({ order: 1, name: 1 }).lean());
});

r.post('/', auth, adminOnly, async (req, res) => {
  const cat = await Category.create(pick(req.body, FIELDS));
  changed(req);
  res.status(201).json(cat);
});

r.put('/:id', auth, adminOnly, async (req, res) => {
  const cat = await Category.findByIdAndUpdate(req.params.id, pick(req.body, FIELDS), { new: true, runValidators: true });
  if (!cat) throw new HttpError(404, 'Category not found');
  changed(req);
  res.json(cat);
});

r.delete('/:id', auth, adminOnly, async (req, res) => {
  const cat = await Category.findByIdAndDelete(req.params.id);
  if (!cat) throw new HttpError(404, 'Category not found');
  await Product.updateMany({ category: cat._id }, { $set: { category: null } });
  changed(req);
  res.json({ ok: true });
});

export default r;
 