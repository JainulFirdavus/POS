import nodemailer from 'nodemailer';
import { MailConfig, getSettings } from './models.js';
import { buildSummary } from './stats.js';
import { HttpError } from './utils.js';

const PAYMENT_LABELS = { cash: 'Cash', card: 'Card', qr: 'DuitNow QR' };
const REASONS = { sale: 'Cash sale', 'no-sale': 'No sale', test: 'Test' };

export const serverTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

const parts = (date, tz) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
export const ymdIn = (date, tz) => {
  const p = parts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
};
export const hmIn = (date, tz) => {
  const p = parts(date, tz);
  return `${p.hour}:${p.minute}`;
};
export const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// The UTC instant of local midnight for a calendar date in the given timezone (DST-safe).
function zonedMidnight(ymd, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offset = (t) => {
    const p = parts(new Date(t), tz);
    return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
  };
  return new Date(guess - offset(guess - offset(guess)));
}
export const dayRange = (ymd, tz) => ({ from: zonedMidnight(ymd, tz), to: new Date(zonedMidnight(addDays(ymd, 1), tz) - 1) });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function moneyFormatter(currency) {
  try {
    const f = new Intl.NumberFormat(currency === 'MYR' ? 'en-MY' : 'en', { style: 'currency', currency });
    return (v) => f.format(Number(v) || 0);
  } catch {
    return (v) => (Number(v) || 0).toFixed(2);
  }
}

const TH = 'style="text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;font-size:12px;color:#64748b;text-transform:uppercase"';
const TD = 'style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:14px"';
const TDR = 'style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:14px;text-align:right;white-space:nowrap"';

function table(headers, rows, rightFrom = 1) {
  if (!rows.length) return '<p style="color:#94a3b8;font-size:14px">Nothing recorded.</p>';
  const head = headers.map((h, i) => `<th ${i >= rightFrom ? TH.replace('text-align:left', 'text-align:right') : TH}>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td ${i >= rightFrom ? TDR : TD}>${c}</td>`).join('')}</tr>`).join('');
  return `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">${`<tr>${head}</tr>`}${body}</table>`;
}

const section = (title, html) => `<h2 style="margin:28px 0 8px;font-size:16px;color:#0f172a">${esc(title)}</h2>${html}`;

export function renderReport(summary, { date, settings, tz }) {
  const money = moneyFormatter(settings.currency || 'MYR');
  const t = summary.totals;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeStyle: 'short' });
  const kpi = (label, value) =>
    `<td style="padding:10px;background:#f8fafc;border-radius:8px;width:25%"><div style="font-size:12px;color:#64748b">${esc(label)}</div><div style="font-size:20px;font-weight:700;color:#0f172a">${esc(value)}</div></td>`;
  const d = summary.drawer;
  const activeHours = summary.hours.filter((h) => h.invoices > 0);
  const maxHour = Math.max(1, ...activeHours.map((h) => h.invoices));
  const dine = summary.orderTypes.find((o) => o.type === 'dine-in');
  const take = summary.orderTypes.find((o) => o.type === 'takeaway');

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
<div style="max-width:680px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:14px;padding:24px">
<div style="font-size:13px;color:#6366f1;font-weight:600">DAILY SALES REPORT</div>
<h1 style="margin:4px 0 2px;font-size:22px">${esc(settings.storeName)}</h1>
<div style="color:#64748b;font-size:14px">${esc(date)} · ${esc(tz)}</div>

<table cellspacing="8" cellpadding="0" style="width:100%;margin-top:16px"><tr>
${kpi('Net sales', money(t.revenue))}${kpi('Orders', t.count)}${kpi('Items sold', t.items)}${kpi('Avg. order', money(t.avg))}
</tr><tr>
${kpi('Gross profit', money(t.profit))}${kpi('Discounts', money(t.discount))}${kpi(settings.taxLabel || 'Tax', money(t.tax))}${kpi('Drawer opens', d.total)}
</tr></table>
${t.voids ? `<p style="color:#b91c1c;font-size:14px">⚠ ${t.voids} voided invoice(s) worth ${esc(money(t.voidTotal))}.</p>` : ''}
${summary.busiestHour ? `<p style="font-size:14px;color:#334155">Busiest hour: <b>${esc(summary.busiestHour.label)}</b> with ${summary.busiestHour.invoices} orders (${esc(money(summary.busiestHour.revenue))}).</p>` : ''}

${section('Cash drawer', `<p style="font-size:14px;margin:0 0 8px">Opened <b>${d.total}</b> time(s): ${d.sale} for cash sales, <b style="color:${d.noSale ? '#b45309' : 'inherit'}">${d.noSale} no-sale</b>${d.test ? `, ${d.test} test` : ''}${d.failed ? `, <b style="color:#b91c1c">${d.failed} failed</b>` : ''}.</p>
${table(['Cashier', 'Opens', 'No-sale'], d.byUser.map((u) => [esc(u.name), u.total, u.noSale]))}
${d.noSale ? `<div style="margin-top:10px"></div>${table(['Time', 'By', 'Reason given'], d.recent.filter((e) => e.reason === 'no-sale').map((e) => [esc(time.format(e.createdAt)), esc(e.user?.name), esc(e.note)]), 3)}` : ''}`)}

${section('Payment methods', table(['Method', 'Orders', 'Amount'], summary.payments.map((p) => [esc(PAYMENT_LABELS[p.method] ?? p.method), p.count, esc(money(p.total))])))}

${section('Dine-in vs takeaway', table(['Type', 'Orders', 'Amount'], [['Dine-in', dine?.count ?? 0, esc(money(dine?.total ?? 0))], ['Takeaway', take?.count ?? 0, esc(money(take?.total ?? 0))]]))}

${section('Sales by category', table(['Category', 'Qty', 'Item sales'], summary.categories.map((c) => [`${esc(c.emoji)} ${esc(c.name)}`, c.qty, esc(money(c.revenue))])))}

${section('Sales by hour', table(['Hour', '', 'Orders', 'Amount'], activeHours.map((h) => [esc(h.label), `<div style="background:#6366f1;height:8px;border-radius:4px;width:${Math.round((h.invoices / maxHour) * 160)}px"></div>`, h.invoices, esc(money(h.revenue))]), 2))}

${section('Top products', table(['Product', 'Qty', 'Sales'], summary.topProducts.map((p) => [esc(p.name), p.qty, esc(money(p.revenue))])))}

${section('Largest orders', table(['Invoice', 'Time', 'Items', 'Total'], summary.biggestOrders.map((o) => [`${esc(o.number)}${o.table ? ` · ${esc(o.table)}` : ''}`, esc(time.format(o.createdAt)), o.items, esc(money(o.total))]), 2))}

${section('Cashiers', table(['Cashier', 'Orders', 'Sales'], summary.cashiers.map((c) => [esc(c.name), c.count, esc(money(c.total))])))}

${summary.lowStock.length ? section('Low stock', table(['Product', 'Stock'], summary.lowStock.map((p) => [esc(p.name), p.stock]))) : ''}
</div>
<p style="text-align:center;color:#94a3b8;font-size:12px">Sent automatically by Smart POS.</p>
</div></body></html>`;

  const subject = `${settings.storeName} daily report ${date}: ${money(t.revenue)} from ${t.count} orders${d.noSale ? `, ${d.noSale} no-sale drawer opens` : ''}`;
  return { subject, html };
}

export async function buildDailyReport(date, cfg) {
  const tz = validTimezone(cfg?.timezone) || serverTimezone();
  const { from, to } = dayRange(date, tz);
  const [settings, summary] = await Promise.all([getSettings(), buildSummary(from, to, tz)]);
  return renderReport(summary, { date, settings, tz });
}

export async function sendDailyReport(date, cfg) {
  if (!cfg.host || !cfg.recipients?.length) throw new HttpError(400, 'Set the SMTP server and at least one recipient first');
  const { subject, html } = await buildDailyReport(date, cfg);
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  try {
    await transport.sendMail({ from: cfg.from || cfg.user, to: cfg.recipients.join(', '), subject, html });
  } catch (e) {
    throw new HttpError(502, `Email failed: ${e.message}`);
  }
}

// Checks once a minute. Sends today's report once the configured time has passed, and if the till was
// switched off at that time it catches up by sending yesterday's report the next time the app starts.
export function startDailyReportScheduler() {
  let running = false;
  let lastFailure = 0;
  const tick = async () => {
    if (running || Date.now() - lastFailure < 15 * 60 * 1000) return;
    running = true;
    try {
      const cfg = await MailConfig.findOne().lean();
      if (!cfg?.enabled || !cfg.host || !cfg.recipients?.length) return;
      const tz = validTimezone(cfg.timezone) || serverTimezone();
      const now = new Date();
      const today = ymdIn(now, tz);
      const yesterday = addDays(today, -1);
      let target = null;
      if (hmIn(now, tz) >= cfg.sendTime && (cfg.lastSentDate || '') < today) target = today;
      else if (cfg.lastSentDate && cfg.lastSentDate < yesterday) target = yesterday;
      if (!target) return;
      try {
        await sendDailyReport(target, cfg);
        await MailConfig.updateOne({ _id: cfg._id }, { lastSentDate: target, lastSentAt: new Date(), lastError: '' });
        console.log(`Daily report for ${target} emailed to ${cfg.recipients.join(', ')}`);
      } catch (e) {
        lastFailure = Date.now();
        await MailConfig.updateOne({ _id: cfg._id }, { lastError: `${new Date().toISOString()}: ${e.message}` });
        console.error('Daily report email failed:', e.message);
      }
    } catch (e) {
      console.error('Daily report scheduler error:', e);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 15000).unref();
  setInterval(tick, 60000).unref();
}
