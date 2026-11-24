import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { BuzzerConfig, DiningTable } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError } from '../utils.js';
import { finishCalls, getBuzzerConfig, keyMatches, newBuzzerKey, normDevice, raiseCall } from '../calls.js';

const r = Router();

// Words a device may send for each button. "ping" only checks the connection and pairing.
const ACTIONS = { waiter: 'waiter', call: 'waiter', service: 'waiter', bill: 'bill', check: 'bill', pay: 'bill', cancel: 'cancel', ping: 'ping' };

const pressLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many presses, slow down' },
});

// Table buzzers (ESP32/ESP8266 buttons, Shelly buttons, Wi-Fi call bells, a receiver bridge...) call:
//   GET or POST /api/buzzer/press/<DEVICE-ID>/<waiter|bill|cancel|ping>?key=<KEY>   (or header X-Buzzer-Key)
// GET is accepted because many simple IoT buttons can only open a URL.
async function press(req, res) {
  const cfg = await getBuzzerConfig();
  if (!keyMatches(req.get('x-buzzer-key') ?? req.query.key ?? req.body?.key, cfg.key)) throw new HttpError(401, 'Wrong buzzer key');
  if (!cfg.enabled) throw new HttpError(503, 'Table buzzers are switched off');
  const device = normDevice(req.params.device);
  const action = ACTIONS[String(req.params.action).toLowerCase()];
  if (!device || !action) throw new HttpError(400, 'Use /press/<device-id>/<waiter|bill|cancel|ping>');

  const io = req.app.get('io');
  const table = await DiningTable.findOne({ buzzer: device }).lean();
  // Lets the admin pair a device by pressing it (see "Detect" on the floor plan page).
  io.emit('buzzer:seen', { device, action, table: table?.name ?? null, at: new Date() });
  if (!table) throw new HttpError(404, `Device ${device} is not paired with a table yet`);

  if (action === 'ping') return res.json({ ok: true, table: table.name });
  if (action === 'cancel') {
    const cancelled = await finishCalls(io, { table: table._id }, `Guest (${device})`, 'cancelled');
    return res.json({ ok: true, table: table.name, cancelled });
  }
  const call = await raiseCall(io, table, action, { source: 'buzzer', device });
  res.json({ ok: true, table: table.name, call: call.type, status: call.status, presses: call.presses });
}

r.get('/press/:device/:action', pressLimiter, press);
r.post('/press/:device/:action', pressLimiter, press);

r.get('/config', auth, adminOnly, async (_req, res) => res.json(await getBuzzerConfig()));

r.put('/config', auth, adminOnly, async (req, res) => {
  const cfg = await getBuzzerConfig();
  res.json(await BuzzerConfig.findByIdAndUpdate(cfg._id, { enabled: !!req.body?.enabled }, { new: true }).lean());
});

r.post('/config/key', auth, adminOnly, async (_req, res) => {
  const cfg = await getBuzzerConfig();
  res.json(await BuzzerConfig.findByIdAndUpdate(cfg._id, { key: newBuzzerKey() }, { new: true }).lean());
});

export default r;
