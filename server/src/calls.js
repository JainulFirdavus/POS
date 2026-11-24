import crypto from 'node:crypto';
import { BuzzerConfig, DiningTable, FloorArea, TableCall } from './models.js';

export const CALL_TYPES = ['waiter', 'bill'];

// Buzzer device IDs: letters, digits, "-" and "_" only, upper-cased (e.g. a MAC address "A4CF12" or "TBL-07").
export const normDevice = (id) => String(id ?? '').replace(/[^0-9A-Za-z_-]/g, '').toUpperCase().slice(0, 40);

export async function getBuzzerConfig() {
  const cfg = await BuzzerConfig.findOne().lean();
  if (cfg) return cfg;
  return (await BuzzerConfig.create({ key: newBuzzerKey() })).toObject();
}

export const newBuzzerKey = () => crypto.randomBytes(12).toString('base64url');

// Constant-time comparison so the key cannot be guessed one character at a time.
export function keyMatches(given, expected) {
  const a = crypto.createHash('sha256').update(String(given ?? '')).digest();
  const b = crypto.createHash('sha256').update(String(expected ?? '')).digest();
  return crypto.timingSafeEqual(a, b);
}

const announce = (io, call, repeat) => {
  io.emit('calls:changed');
  io.emit('call:new', { id: String(call._id), type: call.type, tableName: call.tableName, areaName: call.areaName, presses: call.presses, repeat });
};

// A repeat press while the call is still active rings again (and re-opens it if staff had acknowledged it).
export async function raiseCall(io, table, type, { source = 'buzzer', device } = {}) {
  const now = new Date();
  const bump = () =>
    TableCall.findOneAndUpdate(
      { table: table._id, type, active: true },
      { $inc: { presses: 1 }, $set: { lastPressAt: now, status: 'open' }, $unset: { ackAt: 1, ackBy: 1 } },
      { new: true },
    );
  let call = await bump();
  if (call) {
    announce(io, call, true);
    return call;
  }
  const area = await FloorArea.findById(table.area).select('name').lean();
  try {
    call = await TableCall.create({ table: table._id, tableName: table.name, area: table.area, areaName: area?.name, type, source, device, lastPressAt: now });
  } catch (e) {
    // Two presses arrived at the same moment: the other one created the call.
    if (e.code !== 11000) throw e;
    call = await bump();
  }
  announce(io, call, false);
  return call;
}

export async function finishCalls(io, filter, by, status = 'done') {
  const res = await TableCall.updateMany({ ...filter, active: true }, { status, active: false, doneAt: new Date(), doneBy: by });
  if (res.modifiedCount) io.emit('calls:changed');
  return res.modifiedCount;
}

// The table's guests paid or left: whatever they were calling for is handled.
export async function finishCallsForCard(io, cardId, by) {
  if (!cardId) return 0;
  const tables = await DiningTable.find({ card: cardId }).select('_id').lean();
  if (!tables.length) return 0;
  return finishCalls(io, { table: { $in: tables.map((t) => t._id) } }, by);
}
