export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Bank Negara Malaysia rounding mechanism: the bill total is rounded to the nearest 5 sen
// (1, 2, 6, 7 sen round down; 3, 4, 8, 9 sen round up). Works in whole cents to avoid float drift.
export const roundTo5Sen = (n) => (Math.round(Math.round(Number(n) * 100) / 5) * 5) / 100;
