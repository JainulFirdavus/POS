

import { Router } from 'express';
import { POS_LAYOUT_DEFAULTS, PRINTER_DEFAULTS, Setting, getSettings } from '../models.js';
import { CUPS_NAME_RE, HOST_RE } from '../printer.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, pick } from '../utils.js';

const r = Router();
const FIELDS = ['storeName', 'address', 'logo', 'phone', 'currency', 'taxRate', 'taxLabel', 'taxNumber', 'cashRounding', 'qrImage', 'receiptFooter', 'ticker', 'paymentMethods', 'dashboardTheme', 'sellerTheme', 'printer', 'defaultOrderType', 'posLayout'];
const THEMES = ['midnight', 'forest', 'ember', 'pearl', 'sky', 'sunrise'];
const PAYMENT_METHODS = ['cash', 'card', 'qr'];

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
  validateImage(data.qrImage, 'QR code');
  if (data.cashRounding !== undefined && typeof data.cashRounding !== 'boolean') throw new HttpError(400, 'Invalid cash rounding option');
  for (const key of ['taxLabel', 'taxNumber']) {
    if (data[key] !== undefined) data[key] = String(data[key]).trim();
  }
  if (data.taxLabel === '') data.taxLabel = 'SST';
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
  if (data.printer !== undefined) {
    const p = { ...PRINTER_DEFAULTS, ...(await getSettings()).printer, ...pick(data.printer, Object.keys(PRINTER_DEFAULTS)) };
    if (!['browser', 'network', 'system'].includes(p.mode)) throw new HttpError(400, 'Invalid printer connection');
    p.host = String(p.host ?? '').trim();
    p.systemName = String(p.systemName ?? '').trim();
    p.port = Number(p.port);
    if (p.mode === 'network' && !HOST_RE.test(p.host)) throw new HttpError(400, 'Enter the printer IP address, e.g. 192.168.1.100');
    if (!(Number.isInteger(p.port) && p.port > 0 && p.port < 65536)) throw new HttpError(400, 'Invalid printer port');
    if (p.mode === 'system' && !CUPS_NAME_RE.test(p.systemName)) throw new HttpError(400, 'Choose a system printer');
    for (const k of ['autoPrint', 'openDrawerOnCash']) p[k] = !!p[k];
    p.width = Number(p.width) === 58 ? 58 : 80;
    p.drawerPin = Number(p.drawerPin) === 1 ? 1 : 0;
    data.printer = p;
  }
  if (data.defaultOrderType !== undefined && !['dine-in', 'takeaway'].includes(data.defaultOrderType)) throw new HttpError(400, 'Invalid order type');
  if (data.posLayout !== undefined) {
    const allowed = { view: ['grid', 'list'], tileSize: ['sm', 'md', 'lg', 'xl'], menuPosition: ['left', 'top', 'bottom'], menuSize: ['sm', 'md', 'lg'], cartWidth: ['sm', 'md', 'lg'] };
    const l = { ...POS_LAYOUT_DEFAULTS, ...(await getSettings()).posLayout, ...pick(data.posLayout, Object.keys(POS_LAYOUT_DEFAULTS)) };
    for (const [k, values] of Object.entries(allowed)) if (!values.includes(l[k])) throw new HttpError(400, `Invalid POS layout option: ${k}`);
    l.showStock = !!l.showStock;
    data.posLayout = l;
  }
  if (data.currency !== undefined) {
    data.currency = String(data.currency).toUpperCase();
    try {
      new Intl.NumberFormat('en', { style: 'currency', currency: data.currency });
    } catch {
      throw new HttpError(400, 'Invalid currency code (use e.g. MYR, SGD, USD)');
    }
  }
  const settings = await Setting.findOneAndUpdate({}, data, { new: true, upsert: true, runValidators: true }).lean();
  req.app.get('io').emit('settings:update', settings);
  res.json(settings);
});

export default r;
 