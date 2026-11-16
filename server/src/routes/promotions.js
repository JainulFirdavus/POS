

import { Router } from 'express';
import { Promotion } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, pick } from '../utils.js';

const r = Router();
const FIELDS = ['title', 'message', 'emoji', 'color', 'image', 'active', 'startDate', 'endDate', 'order'];
const changed = (req) => req.app.get('io').emit('promotions:update');

function clean(body) {
  const data = pick(body, FIELDS);
  if (data.image && !/^https?:\/\//i.test(data.image)) {
    const match = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+=*)$/i.exec(data.image);
    if (!match || match[2].length > 1400000) throw new HttpError(400, 'Image must be a PNG, JPEG, GIF, or WEBP image under 1 MB, or an http(s) URL');
  }
  for (const k of ['startDate', 'endDate']) if (data[k] === '') data[k] = null;
  return data;
}

r.get('/active', async (_req, res) => {
  const now = new Date();
  res.json(
    await Promotion.find({
      active: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    })
      .sort({ order: 1, createdAt: -1 })
      .lean(),
  );
});

r.get('/', auth, adminOnly, async (_req, res) => {
  res.json(await Promotion.find().sort({ order: 1, createdAt: -1 }).lean());
});

r.post('/', auth, adminOnly, async (req, res) => {
  const promo = await Promotion.create(clean(req.body));
  changed(req);
  res.status(201).json(promo);
});

r.put('/:id', auth, adminOnly, async (req, res) => {
  const promo = await Promotion.findByIdAndUpdate(req.params.id, clean(req.body), { new: true, runValidators: true });
  if (!promo) throw new HttpError(404, 'Promotion not found');
  changed(req);
  res.json(promo);
});

r.delete('/:id', auth, adminOnly, async (req, res) => {
  if (!(await Promotion.findByIdAndDelete(req.params.id))) throw new HttpError(404, 'Promotion not found');
  changed(req);
  res.json({ ok: true });
});

export default r; 