

import { Router } from 'express';
import { Setting, getSettings } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, pick } from '../utils.js';

const r = Router();
const FIELDS = ['storeName', 'address', 'logo', 'phone', 'currency', 'taxRate', 'receiptFooter', 'ticker', 'paymentMethods', 'dashboardTheme', 'sellerTheme'];
const THEMES = ['midnight', 'forest', 'pearl', 'sky'];
const PAYMENT_METHODS = ['cash', 'card', 'upi'];

function validateImage(image, label) {
  if (!image) return;
  if (/^https:\/\//i.test(image)) return;
  const match = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+=*)$/i.exec(image);
  if (!match || match[2].length > 1400000) throw new HttpError(400, `${label} must be a PNG, JPEG, GIF, or WEBP image under 1 MB`);
}

r.get('/', async (_req, res) => res.json(await getSettings()));

r.put('/', auth, adminOnly, async (req, res) => {
  const data = pick(req.body, FIELDS);
  validateImage(data.logo, 'Logo');
  if (data.paymentMethods !== undefined) {
    const methods = data.paymentMethods;
    if (!methods || typeof methods !== 'object' || Array.isArray(methods) || PAYMENT_METHODS.some((method) => typeof methods[method] !== 'boolean')) {
      throw new HttpError(400, 'Invalid payment methods');
    }
    if (!PAYMENT_METHODS.some((method) => methods[method])) throw new HttpError(400, 'At least one payment method must be enabled');
    data.paymentMethods = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, methods[method]]));
  }
  for (const key of ['dashboardTheme', 'sellerTheme']) {
    if (data[key] !== undefined && !THEMES.includes(data[key])) throw new HttpError(400, 'Invalid theme');
  }
  if (data.currency !== undefined) {
    data.currency = String(data.currency).toUpperCase();
    try {
      new Intl.NumberFormat('en', { style: 'currency', currency: data.currency });
    } catch {
      throw new HttpError(400, 'Invalid currency code (use e.g. INR, USD, EUR)');
    }
  }
  const settings = await Setting.findOneAndUpdate({}, data, { new: true, upsert: true, runValidators: true }).lean();
  req.app.get('io').emit('settings:update', settings);
  res.json(settings);
});

export default r;
 