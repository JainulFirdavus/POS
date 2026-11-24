import net from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { HttpError } from './utils.js';

// ESC/POS command set understood by practically every thermal receipt printer (Epson, Xprinter, Rongta, Sunmi...).
const ESC = 0x1b;
const GS = 0x1d;
const PAYMENT_LABELS = { cash: 'Cash', card: 'Card', qr: 'DuitNow QR' };

export const HOST_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$|^\[?[0-9A-Fa-f:]+\]?$/;
export const CUPS_NAME_RE = /^[A-Za-z0-9_.@-]{1,120}$/;

// A cash drawer plugs into the printer's RJ11 "DK" port; this pulse fires its solenoid. Pin 0 = connector pin 2, pin 1 = pin 5.
export const drawerKick = (pin = 0) => Buffer.from([ESC, 0x70, pin ? 1 : 0, 0x19, 0xfa]);

// Thermal printers use single-byte code pages; strip accents and anything non-ASCII (emoji, CJK) so the receipt never prints garbage.
const ascii = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x20-\x7e]/g, '');

class EscPos {
  constructor(width) {
    this.cols = width === 58 ? 32 : 48;
    this.parts = [Buffer.from([ESC, 0x40])];
  }
  raw(...bytes) {
    this.parts.push(Buffer.from(bytes));
    return this;
  }
  text(s) {
    this.parts.push(Buffer.from(ascii(s), 'ascii'));
    return this;
  }
  line(s = '') {
    return this.text(s).raw(0x0a);
  }
  align(a) {
    return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[a]);
  }
  bold(on) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  size(double) {
    return this.raw(GS, 0x21, double ? 0x11 : 0x00);
  }
  divider(ch = '-') {
    return this.line(ch.repeat(this.cols));
  }
  // Left and right text on one line, wrapping the left side if needed.
  pair(left, right) {
    left = ascii(left);
    right = ascii(right);
    const room = this.cols - right.length - 1;
    while (left.length > room) {
      this.line(left.slice(0, this.cols));
      left = left.slice(this.cols);
    }
    return this.line(left + ' '.repeat(this.cols - left.length - right.length) + right);
  }
  wrap(s) {
    s = ascii(s);
    for (let i = 0; i < s.length || i === 0; i += this.cols) this.line(s.slice(i, i + this.cols));
    return this;
  }
  cut() {
    return this.raw(0x0a, 0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00);
  }
  build() {
    return Buffer.concat(this.parts);
  }
}

function moneyFormatter(currency) {
  try {
    const f = new Intl.NumberFormat(currency === 'MYR' ? 'en-MY' : 'en', { style: 'currency', currency });
    return (v) => ascii(f.format(Number(v) || 0));
  } catch {
    return (v) => (Number(v) || 0).toFixed(2);
  }
}

export function receiptBuffer(invoice, settings) {
  const money = moneyFormatter(settings.currency || 'MYR');
  const p = new EscPos(settings.printer?.width);
  p.align('center').bold(true).size(true).wrap(settings.storeName).size(false).bold(false);
  if (settings.address) p.wrap(settings.address);
  if (settings.phone) p.line(`Tel: ${settings.phone}`);
  if (settings.taxNumber) p.line(`${settings.taxLabel || 'SST'} Reg. No: ${settings.taxNumber}`);
  p.align('left').divider();
  p.pair(invoice.number, new Date(invoice.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }));
  p.line(`Cashier: ${invoice.cashier?.name ?? ''}`);
  p.bold(true).line(invoice.orderType === 'dine-in' ? `DINE-IN  ${invoice.table ?? ''}` : 'TAKE AWAY').bold(false);
  p.divider();
  for (const it of invoice.items) {
    p.wrap(it.name);
    p.pair(`  ${it.qty} x ${money(it.price)}`, money(it.total));
  }
  p.divider();
  p.pair('Subtotal', money(invoice.subtotal));
  if (invoice.discount > 0) p.pair('Discount', `-${money(invoice.discount)}`);
  if (invoice.taxRate > 0) p.pair(`${invoice.taxLabel || 'Tax'} (${invoice.taxRate}%)`, money(invoice.tax));
  if (invoice.rounding) p.pair('Rounding', `${invoice.rounding > 0 ? '' : '-'}${money(Math.abs(invoice.rounding))}`);
  p.bold(true).size(true);
  p.cols = Math.floor(p.cols / 2);
  p.pair('TOTAL', money(invoice.total));
  p.cols *= 2;
  p.size(false).bold(false);
  p.pair(`Paid (${PAYMENT_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod})`, money(invoice.paid));
  if (invoice.change > 0) p.pair('Change', money(invoice.change));
  p.divider();
  if (invoice.status === 'void') p.align('center').bold(true).line('*** VOID ***').bold(false);
  if (settings.receiptFooter) p.align('center').wrap(settings.receiptFooter);
  return p.cut().build();
}

export function testPageBuffer(settings) {
  const p = new EscPos(settings.printer?.width);
  p.align('center').bold(true).size(true).line('PRINTER TEST').size(false).bold(false);
  p.line(settings.storeName);
  p.line(new Date().toLocaleString('en-GB'));
  p.divider('=');
  p.align('left').pair('Paper width', `${settings.printer?.width ?? 80} mm`);
  p.pair('Connection', settings.printer?.mode ?? '');
  p.line('0123456789'.repeat(Math.ceil(p.cols / 10)).slice(0, p.cols));
  p.divider('=');
  p.align('center').line('If you can read this, printing works.');
  return p.cut().build();
}

function sendNetwork(host, port, buf) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    const fail = (msg) => {
      sock.destroy();
      reject(new HttpError(502, msg));
    };
    sock.setTimeout(4000, () => fail(`Printer at ${host}:${port} did not respond. Check it is on and the IP address is right.`));
    sock.once('error', (e) => fail(`Cannot reach printer at ${host}:${port} (${e.code || e.message})`));
    sock.once('connect', () =>
      sock.end(buf, () => {
        resolve();
        setTimeout(() => sock.destroy(), 1500).unref();
      }),
    );
  });
}

function sendCups(name, buf) {
  if (process.platform === 'win32') return Promise.reject(new HttpError(400, 'USB / system printer mode needs macOS or Linux. On Windows use a network printer.'));
  if (!CUPS_NAME_RE.test(name)) return Promise.reject(new HttpError(400, 'Choose a system printer first'));
  return new Promise((resolve, reject) => {
    const child = spawn('lp', ['-d', name, '-o', 'raw'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 8000);
    child.stderr.on('data', (d) => (stderr += d));
    child.once('error', (e) => {
      clearTimeout(timer);
      reject(new HttpError(502, `Could not run the print command: ${e.message}`));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new HttpError(502, `Printer "${name}" rejected the job: ${stderr.trim() || `exit code ${code}`}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(buf);
  });
}

export function sendRaw(printer, buf) {
  if (printer.mode === 'network') {
    if (!printer.host) return Promise.reject(new HttpError(400, 'Set the printer IP address first'));
    return sendNetwork(printer.host, printer.port || 9100, buf);
  }
  if (printer.mode === 'system') return sendCups(printer.systemName, buf);
  return Promise.reject(new HttpError(400, 'No receipt printer is connected. Set one up in Admin → Printer & Drawer.'));
}

export function listSystemPrinters() {
  if (process.platform === 'win32') return Promise.resolve({ printers: [], default: '' });
  const run = (args) =>
    new Promise((resolve) => execFile('lpstat', args, { timeout: 5000, env: { ...process.env, LANG: 'C', LC_ALL: 'C' } }, (err, stdout) => resolve(err ? '' : String(stdout))));
  return Promise.all([run(['-p']), run(['-d'])]).then(([list, def]) => ({
    printers: [...list.matchAll(/^printer\s+(\S+)/gm)].map((m) => m[1]),
    default: /:\s*(\S+)\s*$/m.exec(def)?.[1] ?? '',
  }));
}
