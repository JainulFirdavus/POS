import { Router } from 'express';
import mongoose from 'mongoose';
import { DiningTable, TableCall } from '../models.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../utils.js';
import { CALL_TYPES, raiseCall } from '../calls.js';

const r = Router();
r.use(auth);

r.get('/', async (req, res) => {
  if (req.query.recent) {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Admin access required');
    return res.json(await TableCall.find().sort({ createdAt: -1 }).limit(100).lean());
  }
  res.json(await TableCall.find({ active: true }).sort({ createdAt: 1 }).lean());
});

// Staff raise a call by hand, e.g. to test a table or when a guest waves instead of pressing the buzzer.
r.post('/', async (req, res) => {
  if (!CALL_TYPES.includes(req.body?.type)) throw new HttpError(400, 'Invalid call type');
  if (!mongoose.isValidObjectId(req.body?.tableId)) throw new HttpError(404, 'Table not found');
  const table = await DiningTable.findById(req.body.tableId).lean();
  if (!table) throw new HttpError(404, 'Table not found');
  res.status(201).json(await raiseCall(req.app.get('io'), table, req.body.type, { source: 'staff' }));
});

async function update(req, res, filter, set) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Call not found');
  const call = await TableCall.findOneAndUpdate({ _id: req.params.id, active: true, ...filter }, set, { new: true });
  if (!call) {
    const current = await TableCall.findById(req.params.id).lean();
    if (!current) throw new HttpError(404, 'Call not found');
    return res.json(current); // someone else already handled it
  }
  req.app.get('io').emit('calls:changed');
  res.json(call);
}

// "On my way": a waiter has seen the call.
r.post('/:id/ack', (req, res) => update(req, res, { status: 'open' }, { status: 'ack', ackAt: new Date(), ackBy: req.user.name }));

r.post('/:id/done', (req, res) =>
  update(req, res, {}, [
    // ackAt is filled in when the call is closed without an "on my way", so response times stay measurable.
    { $set: { status: 'done', active: false, doneAt: '$$NOW', doneBy: req.user.name, ackAt: { $ifNull: ['$ackAt', '$$NOW'] }, ackBy: { $ifNull: ['$ackBy', req.user.name] } } },
  ]),
);

export default r;
