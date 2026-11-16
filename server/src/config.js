import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PORT = Number(process.env.PORT) || 4000;
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(import.meta.dirname, '../data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadOrCreateSecret() {
  const file = path.join(DATA_DIR, 'jwt.secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const JWT_SECRET = process.env.JWT_SECRET || loadOrCreateSecret();
