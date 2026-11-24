import { DrawerEvent, Invoice, Product, Tab } from './models.js';
import { round2 } from './utils.js';

export const paidIn = (from, to) => ({ status: 'paid', createdAt: { $gte: from, $lte: to } });

export function salesByProduct(match) {
  return Invoice.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: { $ifNull: ['$items.product', { $concat: ['custom:', '$items.name'] }] },
        name: { $last: '$items.name' },
        sku: { $last: '$items.sku' },
        qty: { $sum: '$items.qty' },
        revenue: { $sum: '$items.total' },
        cost: { $sum: { $multiply: [{ $ifNull: ['$items.cost', 0] }, '$items.qty'] } },
      },
    },
    { $sort: { revenue: -1 } },
  ]);
}

export function grouped(match, format, tz) {
  return Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format, date: '$createdAt', timezone: tz } },
        invoices: { $sum: 1 },
        items: { $sum: { $sum: '$items.qty' } },
        subtotal: { $sum: '$subtotal' },
        discount: { $sum: '$discount' },
        tax: { $sum: '$tax' },
        revenue: { $sum: '$total' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

// Item sales per category. Older invoices did not store the category on each line, so it falls back to the product's current category.
export async function salesByCategory(match) {
  const rows = await Invoice.aggregate([
    { $match: match },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
    {
      $group: {
        _id: { $ifNull: ['$items.category', { $arrayElemAt: ['$p.category', 0] }] },
        qty: { $sum: '$items.qty' },
        revenue: { $sum: '$items.total' },
        orders: { $addToSet: '$_id' },
      },
    },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c' } },
    {
      $project: {
        name: { $ifNull: [{ $arrayElemAt: ['$c.name', 0] }, 'Uncategorised / custom'] },
        emoji: { $ifNull: [{ $arrayElemAt: ['$c.emoji', 0] }, '🍽️'] },
        color: { $ifNull: [{ $arrayElemAt: ['$c.color', 0] }, '#64748b'] },
        qty: 1,
        revenue: 1,
        orders: { $size: '$orders' },
      },
    },
    { $sort: { revenue: -1 } },
  ]);
  return rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));
}

async function salesByHour(match, tz) {
  const rows = await Invoice.aggregate([
    { $match: match },
    { $group: { _id: { $hour: { date: '$createdAt', timezone: tz } }, invoices: { $sum: 1 }, revenue: { $sum: '$total' } } },
  ]);
  const byHour = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    invoices: byHour.get(h)?.invoices ?? 0,
    revenue: round2(byHour.get(h)?.revenue ?? 0),
  }));
}

export async function drawerStats(from, to, tz) {
  const events = await DrawerEvent.find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).lean();
  const count = (pred) => events.filter(pred).length;
  const byUser = new Map();
  const byDay = new Map();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  for (const e of events) {
    const u = byUser.get(e.user?.name) ?? { name: e.user?.name ?? '-', total: 0, noSale: 0 };
    u.total += 1;
    if (e.reason === 'no-sale') u.noSale += 1;
    byUser.set(u.name, u);
    const d = day.format(e.createdAt);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  return {
    total: events.length,
    sale: count((e) => e.reason === 'sale'),
    noSale: count((e) => e.reason === 'no-sale'),
    test: count((e) => e.reason === 'test'),
    failed: count((e) => !e.ok),
    byUser: [...byUser.values()].sort((a, b) => b.total - a.total),
    byDay: [...byDay].map(([date, opens]) => ({ date, opens })).sort((a, b) => a.date.localeCompare(b.date)),
    recent: events.slice(0, 50),
  };
}

export async function buildSummary(from, to, tz) {
  const match = paidIn(from, to);
  const days = (to - from) / 864e5;
  const fmt = days <= 1.01 ? '%H:00' : days > 62 ? '%Y-%m' : '%Y-%m-%d';

  const [series, products, payments, lowStock, categories, hours, orderTypes, biggest, cashiers, voids, drawer, openTabs] = await Promise.all([
    grouped(match, fmt, tz),
    salesByProduct(match),
    Invoice.aggregate([{ $match: match }, { $group: { _id: '$paymentMethod', total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    Product.find({ active: true, $expr: { $lte: ['$stock', '$lowStock'] } }).select('name emoji stock lowStock').sort({ stock: 1 }).limit(10).lean(),
    salesByCategory(match),
    salesByHour(match, tz),
    Invoice.aggregate([{ $match: match }, { $group: { _id: { $ifNull: ['$orderType', 'takeaway'] }, count: { $sum: 1 }, total: { $sum: '$total' } } }]),
    Invoice.find(match).sort({ total: -1 }).limit(5).select('number total createdAt cashier items.qty orderType table paymentMethod').lean(),
    Invoice.aggregate([
      { $match: match },
      { $group: { _id: '$cashier.name', count: { $sum: 1 }, total: { $sum: '$total' } } },
      { $sort: { total: -1 } },
    ]),
    Invoice.aggregate([{ $match: { status: 'void', createdAt: { $gte: from, $lte: to } } }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$total' } } }]),
    drawerStats(from, to, tz),
    Tab.find({ status: 'open' }).select('items.price items.qty').lean(),
  ]);

  const sum = (arr, k) => round2(arr.reduce((s, x) => s + (x[k] || 0), 0));
  const revenue = sum(series, 'revenue');
  const count = sum(series, 'invoices');
  const discount = sum(series, 'discount');
  const busiest = hours.reduce((best, h) => (h.invoices > (best?.invoices ?? 0) ? h : best), null);
  return {
    totals: {
      revenue,
      count,
      items: sum(series, 'items'),
      tax: sum(series, 'tax'),
      discount,
      avg: count ? round2(revenue / count) : 0,
      profit: round2(sum(products, 'revenue') - sum(products, 'cost') - discount),
      voids: voids[0]?.count ?? 0,
      voidTotal: round2(voids[0]?.total ?? 0),
    },
    series: series.map((s) => ({ label: s._id, revenue: round2(s.revenue), invoices: s.invoices })),
    topProducts: products.slice(0, 10).map((p) => ({ ...p, revenue: round2(p.revenue) })),
    payments: payments.map((p) => ({ method: p._id, total: round2(p.total), count: p.count })),
    lowStock,
    categories,
    hours,
    busiestHour: busiest,
    orderTypes: orderTypes.map((o) => ({ type: o._id, count: o.count, total: round2(o.total) })),
    biggestOrders: biggest.map((i) => ({ ...i, items: i.items.reduce((s, l) => s + l.qty, 0) })),
    cashiers: cashiers.map((c) => ({ name: c._id ?? '-', count: c.count, total: round2(c.total) })),
    drawer,
    openTabs: { count: openTabs.length, total: round2(openTabs.reduce((s, t) => s + t.items.reduce((a, i) => a + i.price * i.qty, 0), 0)) },
  };
}
