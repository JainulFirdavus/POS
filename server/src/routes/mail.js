import { Router } from 'express';
import { MailConfig } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError } from '../utils.js';
import { buildDailyReport, sendDailyReport, serverTimezone, validTimezone, ymdIn } from '../dailyReport.js';

const r = Router();
r.use(auth, adminOnly);

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function getConfig() {
  return (await MailConfig.findOne()) ?? (await MailConfig.create({ timezone: serverTimezone() }));
}

// The SMTP password is write-only: it is never sent back to the browser.
const publicConfig = (cfg) => {
  const { pass, __v, ...rest } = cfg.toObject();
  return { ...rest, timezone: rest.timezone || serverTimezone(), hasPassword: !!pass };
};

r.get('/', async (_req, res) => res.json(publicConfig(await getConfig())));

r.put('/', async (req, res) => {
  const b = req.body ?? {};
  const data = {};
  if (b.enabled !== undefined) data.enabled = !!b.enabled;
  for (const k of ['host', 'user', 'from']) if (b[k] !== undefined) data[k] = String(b[k]).trim();
  if (b.port !== undefined) data.port = Number(b.port);
  if (b.secure !== undefined) data.secure = !!b.secure;
  if (typeof b.pass === 'string' && b.pass) data.pass = b.pass;
  if (b.clearPassword === true) data.pass = '';
  if (b.sendTime !== undefined) data.sendTime = String(b.sendTime);
  if (b.timezone !== undefined) {
    if (!validTimezone(String(b.timezone))) throw new HttpError(400, 'Unknown timezone');
    data.timezone = String(b.timezone);
  }
  if (b.recipients !== undefined) {
    const list = (Array.isArray(b.recipients) ? b.recipients : String(b.recipients).split(/[\s,;]+/)).map((e) => String(e).trim()).filter(Boolean);
    const bad = list.find((e) => !EMAIL_RE.test(e));
    if (bad) throw new HttpError(400, `Not a valid email address: ${bad}`);
    if (list.length > 10) throw new HttpError(400, 'At most 10 recipients');
    data.recipients = [...new Set(list)];
  }
  if (data.from && !EMAIL_RE.test(data.from.replace(/^.*<(.+)>$/, '$1'))) throw new HttpError(400, 'The "From" address is not a valid email');
  const cfg = await getConfig();
  cfg.set(data);
  if (data.enabled && cfg.isModified('enabled')) cfg.lastError = '';
  await cfg.save();
  res.json(publicConfig(cfg));
});

const dateParam = (q, tz) => {
  const d = q ? String(q) : ymdIn(new Date(), tz);
  if (!DATE_RE.test(d)) throw new HttpError(400, 'Invalid date');
  return d;
};

r.get('/preview', async (req, res) => {
  const cfg = await getConfig();
  const tz = validTimezone(cfg.timezone) || serverTimezone();
  const { html } = await buildDailyReport(dateParam(req.query.date, tz), cfg);
  res.type('html').send(html);
});

r.post('/test', async (req, res) => {
  const cfg = await getConfig();
  const tz = validTimezone(cfg.timezone) || serverTimezone();
  const date = dateParam(req.body?.date, tz);
  try {
    await sendDailyReport(date, cfg);
  } catch (e) {
    cfg.lastError = `${new Date().toISOString()}: ${e.message}`;
    await cfg.save();
    throw e;
  }
  cfg.lastError = '';
  await cfg.save();
  res.json({ ok: true, date, sentTo: cfg.recipients });
});

export default r;
