
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import { User } from '../models.js';
import { JWT_SECRET } from '../config.js';

const r = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

r.get('/sellers', async (_req, res) => {
  res.json(await User.find({ active: true, role: 'cashier' }).select('name color').sort({ name: 1 }).lean());
});

r.post('/login', loginLimiter, async (req, res) => {
  const { mode, userId, username, secret } = req.body ?? {};
  if (typeof secret !== 'string' || !secret) return res.status(400).json({ error: 'Credentials required' });

  let user = null;
  if (mode === 'seller' && mongoose.isValidObjectId(userId)) {
    user = await User.findOne({ _id: String(userId), role: 'cashier', active: true });
  } else if (mode === 'admin') {
    user = await User.findOne({ username: String(username ?? '').toLowerCase().trim(), role: 'admin', active: true });
  }

  const ok = user && (await bcrypt.compare(secret, user.secretHash));
  if (!ok) return res.status(401).json({ error: mode === 'seller' ? 'Wrong PIN' : 'Invalid username or password' });

  const payload = { id: String(user._id), name: user.name, role: user.role, color: user.color };
  res.json({ token: jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' }), user: payload });
});

export default r; 