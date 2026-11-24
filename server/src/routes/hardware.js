import { Router } from 'express';
import mongoose from 'mongoose';
import { DrawerEvent, Invoice, getSettings } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError } from '../utils.js';
import { openDrawer, printReceipt } from '../hardware.js';
import { listSystemPrinters, sendRaw, testPageBuffer } from '../printer.js';

const r = Router();
r.use(auth);

// "No sale": a cashier opens the drawer without a sale (giving change, a float top-up...). Always logged.
r.post('/drawer/open', async (req, res) => {
  const note = String(req.body?.note ?? '').trim().slice(0, 160);
  if (!note) throw new HttpError(400, 'Give a reason for opening the drawer');
  const event = await openDrawer(req.app.get('io'), { reason: 'no-sale', note, user: req.user });
  if (!event.ok) throw new HttpError(502, `Logged, but the drawer did not open: ${event.error}`);
  res.status(201).json(event);
});

r.get('/drawer/events', adminOnly, async (req, res) => {
  const from = new Date(String(req.query.from ?? ''));
  const to = new Date(String(req.query.to ?? ''));
  if (isNaN(from) || isNaN(to) || from > to) throw new HttpError(400, 'Invalid date range');
  res.json(await DrawerEvent.find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).limit(1000).lean());
});

// Reprint a receipt on the connected thermal printer.
r.post('/print/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Invoice not found');
  const inv = await Invoice.findById(req.params.id).lean();
  if (!inv || (req.user.role !== 'admin' && String(inv.cashier?.id) !== req.user.id)) throw new HttpError(404, 'Invoice not found');
  await printReceipt(inv);
  res.json({ ok: true });
});

r.post('/test', adminOnly, async (req, res) => {
  const settings = await getSettings();
  if (settings.printer.mode === 'browser') throw new HttpError(400, 'Choose a network or USB printer connection first: a web browser cannot talk to the printer or drawer directly.');
  if (req.body?.what === 'drawer') {
    const event = await openDrawer(req.app.get('io'), { reason: 'test', note: 'Test from settings', user: req.user, settings });
    if (!event.ok) throw new HttpError(502, event.error);
  } else {
    await sendRaw(settings.printer, testPageBuffer(settings));
  }
  res.json({ ok: true });
});

r.get('/printers', adminOnly, async (_req, res) => res.json(await listSystemPrinters()));

export default r;
