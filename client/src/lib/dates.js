
export const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const pad = (n) => String(n).padStart(2, '0');

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

export const toInputDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toInputMonth = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const fromInput = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};

export const rangeQuery = (from, to, extra = {}) =>
  new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), tz, ...extra }).toString();

export function presetRange(id) {
  const now = new Date();
  if (id === 'week') {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from, to: endOfDay(now) };
  }
  if (id === 'month') return { from: startOfMonth(now), to: endOfMonth(now) };
  if (id === 'year') return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
  return { from: startOfDay(now), to: endOfDay(now) };
}

export const fmtDateTime = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
