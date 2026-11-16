
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models.js';
import { auth, adminOnly } from '../middleware/auth.js';
import { HttpError, pick } from '../utils.js';

const r = Router();
r.use(auth, adminOnly);

const FIELDS = ['name', 'username', 'role', 'color', 'active'];

function validateSecret(role, secret) {
  if (role === 'cashier' && !/^\d{4,6}$/.test(secret)) throw new HttpError(400, 'Seller PIN must be 4-6 digits');
  if (role === 'admin' && secret.length < 6) throw new HttpError(400, 'Admin password must be at least 6 characters');
}

r.get('/', async (_req, res) => {
  res.json(await User.find().select('-secretHash').sort({ role: 1, name: 1 }).lean());
});

r.post('/', async (req, res) => {
  const data = pick(req.body, FIELDS);
  const secret = String(req.body.secret ?? '');
  validateSecret(data.role || 'cashier', secret);
  const user = await User.create({ ...data, secretHash: await bcrypt.hash(secret, 10) });
  res.status(201).json(user);
});

r.put('/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  const data = pick(req.body, FIELDS);
  const isSelf = String(user._id) === req.user.id;
  if (isSelf && ((data.role && data.role !== 'admin') || data.active === false)) {
    throw new HttpError(400, 'You cannot demote or deactivate your own account');
  }
  const roleChanged = data.role && data.role !== user.role;
  Object.assign(user, data);
  const secret = String(req.body.secret ?? '');
  if (secret) {
    validateSecret(user.role, secret);
    user.secretHash = await bcrypt.hash(secret, 10);
  } else if (roleChanged) {
    throw new HttpError(400, 'Set a new PIN/password when changing role');
  }
  await user.save();
  res.json(user);
});

r.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ ok: true });
});

export default r;
