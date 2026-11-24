
import { Router } from 'express';
import { Category, DrawerEvent, Invoice, Product } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, round2 } from '../utils.js';
import { sendReport } from '../exporters.js';
import { buildSummary, grouped, paidIn, salesByCategory, salesByProduct } from '../stats.js';

const r = Router();
const PAYMENT_LABELS = { cash: 'Cash', card: 'Card', qr: 'DuitNow QR' };
r.use(auth, adminOnly);

function parseRange(q) {
  const now = new Date();
  const from = q.from ? new Date(String(q.from)) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = q.to ? new Date(String(q.to)) : now;
  if (isNaN(from) || isNaN(to) || from > to) throw new HttpError(400, 'Invalid date range');
  let tz = String(q.tz || 'UTC');
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  return { from, to, tz };
}

r.get('/summary', async (req, res) => {
  const { from, to, tz } = parseRange(req.query);
  res.json(await buildSummary(from, to, tz));
});

r.get('/export', async (req, res) => {
  const type = String(req.query.type || 'invoices');
  const format = String(req.query.format || 'xlsx');
  const { from, to, tz } = parseRange(req.query);
  const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  const dateTime = new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' });
  const period = `${ymd(from)} to ${ymd(to)}`;
  const filename = `${type}_${ymd(from)}_${ymd(to)}`;
  let report;

  if (type === 'invoices') {
    const list = await Invoice.find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: 1 }).lean();
    const paid = list.filter((i) => i.status === 'paid');
    const total = (k) => round2(paid.reduce((s, i) => s + (i[k] || 0), 0));
    report = {
      title: 'Invoice Register',
      columns: [
        { header: 'Invoice #', key: 'number', width: 20 },
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Cashier', key: 'cashier', width: 14 },
        { header: 'Items', key: 'items', width: 8, type: 'number' },
        { header: 'Subtotal', key: 'subtotal', width: 12, type: 'money' },
        { header: 'Discount', key: 'discount', width: 11, type: 'money' },
        { header: 'Tax', key: 'tax', width: 10, type: 'money' },
        { header: 'Total', key: 'total', width: 12, type: 'money' },
        { header: 'Payment', key: 'payment', width: 10 },
        { header: 'Status', key: 'status', width: 9 },
      ],
      rows: list.map((i) => ({
        number: i.number,
        date: dateTime.format(i.createdAt),
        cashier: i.cashier?.name,
        items: i.items.reduce((s, l) => s + l.qty, 0),
        subtotal: i.subtotal,
        discount: i.discount,
        tax: i.tax,
        total: i.total,
        payment: PAYMENT_LABELS[i.paymentMethod] ?? i.paymentMethod,
        status: i.status.toUpperCase(),
      })),
      totals: {
        number: `TOTAL (${paid.length} paid)`,
        items: paid.reduce((s, i) => s + i.items.reduce((a, l) => a + l.qty, 0), 0),
        subtotal: total('subtotal'),
        discount: total('discount'),
        tax: total('tax'),
        total: total('total'),
      },
    };
  } else if (type === 'daily') {
    const fmt = req.query.group === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const rows = await grouped(paidIn(from, to), fmt, tz);
    const total = (k) => round2(rows.reduce((s, x) => s + x[k], 0));
    report = {
      title: req.query.group === 'month' ? 'Month-wise Sales Summary' : 'Day-wise Sales Summary',
      columns: [
        { header: 'Period', key: '_id', width: 14 },
        { header: 'Invoices', key: 'invoices', width: 10, type: 'number' },
        { header: 'Items Sold', key: 'items', width: 10, type: 'number' },
        { header: 'Subtotal', key: 'subtotal', width: 14, type: 'money' },
        { header: 'Discount', key: 'discount', width: 12, type: 'money' },
        { header: 'Tax', key: 'tax', width: 12, type: 'money' },
        { header: 'Net Sales', key: 'revenue', width: 14, type: 'money' },
      ],
      rows: rows.map((x) => ({ ...x, subtotal: round2(x.subtotal), discount: round2(x.discount), tax: round2(x.tax), revenue: round2(x.revenue) })),
      totals: { _id: 'TOTAL', invoices: total('invoices'), items: total('items'), subtotal: total('subtotal'), discount: total('discount'), tax: total('tax'), revenue: total('revenue') },
    };
  } else if (type === 'sales') {
    const rows = (await salesByProduct(paidIn(from, to))).map((p) => ({
      sku: p.sku,
      name: p.name,
      qty: p.qty,
      revenue: round2(p.revenue),
      cost: round2(p.cost),
      profit: round2(p.revenue - p.cost),
      margin: p.revenue ? round2(((p.revenue - p.cost) / p.revenue) * 100) : 0,
    }));
    const total = (k) => round2(rows.reduce((s, x) => s + x[k], 0));
    report = {
      title: 'Product Sales Report',
      columns: [
        { header: 'SKU', key: 'sku', width: 12 },
        { header: 'Product', key: 'name', width: 28 },
        { header: 'Qty Sold', key: 'qty', width: 10, type: 'number' },
        { header: 'Revenue', key: 'revenue', width: 14, type: 'money' },
        { header: 'Cost', key: 'cost', width: 14, type: 'money' },
        { header: 'Profit', key: 'profit', width: 14, type: 'money' },
        { header: 'Margin %', key: 'margin', width: 10, type: 'number' },
      ],
      rows,
      totals: { name: 'TOTAL', qty: total('qty'), revenue: total('revenue'), cost: total('cost'), profit: total('profit') },
    };
  } else if (type === 'stock') {
    const [products, cats] = await Promise.all([Product.find().sort({ name: 1 }).lean(), Category.find().lean()]);
    const catName = new Map(cats.map((c) => [String(c._id), c.name]));
    const rows = products.map((p) => ({
      sku: p.sku,
      name: p.name,
      category: catName.get(String(p.category)) || '-',
      price: p.price,
      cost: p.cost,
      stock: p.stock,
      value: round2(p.cost * p.stock),
      retail: round2(p.price * p.stock),
      status: !p.active ? 'Inactive' : p.stock <= 0 ? 'Out of stock' : p.stock <= p.lowStock ? 'Low' : 'OK',
    }));
    const total = (k) => round2(rows.reduce((s, x) => s + x[k], 0));
    report = {
      title: 'Stock Report',
      columns: [
        { header: 'SKU', key: 'sku', width: 11 },
        { header: 'Product', key: 'name', width: 24 },
        { header: 'Category', key: 'category', width: 14 },
        { header: 'Price', key: 'price', width: 11, type: 'money' },
        { header: 'Cost', key: 'cost', width: 11, type: 'money' },
        { header: 'Stock', key: 'stock', width: 9, type: 'number' },
        { header: 'Stock Value', key: 'value', width: 13, type: 'money' },
        { header: 'Retail Value', key: 'retail', width: 13, type: 'money' },
        { header: 'Status', key: 'status', width: 11 },
      ],
      rows,
      totals: { name: 'TOTAL', stock: total('stock'), value: total('value'), retail: total('retail') },
    };
  } else if (type === 'categories') {
    const rows = await salesByCategory(paidIn(from, to));
    const total = (k) => round2(rows.reduce((s, x) => s + x[k], 0));
    report = {
      title: 'Category Sales Report',
      columns: [
        { header: 'Category', key: 'name', width: 26 },
        { header: 'Orders', key: 'orders', width: 10, type: 'number' },
        { header: 'Qty Sold', key: 'qty', width: 10, type: 'number' },
        { header: 'Item Sales', key: 'revenue', width: 14, type: 'money' },
        { header: 'Share %', key: 'share', width: 10, type: 'number' },
      ],
      rows: rows.map((x) => ({ ...x, share: total('revenue') ? round2((x.revenue / total('revenue')) * 100) : 0 })),
      totals: { name: 'TOTAL', qty: total('qty'), revenue: total('revenue') },
    };
  } else if (type === 'drawer') {
    const events = await DrawerEvent.find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: 1 }).lean();
    const REASONS = { sale: 'Cash sale', 'no-sale': 'No sale (manual)', test: 'Test' };
    report = {
      title: 'Cash Drawer Log',
      columns: [
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Reason', key: 'reason', width: 16 },
        { header: 'By', key: 'user', width: 14 },
        { header: 'Invoice #', key: 'invoice', width: 20 },
        { header: 'Amount', key: 'amount', width: 11, type: 'money' },
        { header: 'Note', key: 'note', width: 26 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows: events.map((e) => ({
        date: dateTime.format(e.createdAt),
        reason: REASONS[e.reason] ?? e.reason,
        user: e.user?.name,
        invoice: e.invoiceNumber,
        amount: e.amount,
        note: e.note,
        status: e.ok ? 'Opened' : `Failed: ${e.error ?? ''}`.slice(0, 60),
      })),
      totals: {
        date: `TOTAL ${events.length} opens`,
        reason: `${events.filter((e) => e.reason === 'no-sale').length} no-sale`,
      },
    };
  } else {
    throw new HttpError(400, 'Unknown report type');
  }

  const subtitle = type === 'stock' ? `As of ${dateTime.format(new Date())}` : `Period: ${period}`;
  await sendReport(res, format, { ...report, subtitle, filename });
});

export default r; 