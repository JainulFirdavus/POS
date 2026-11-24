
import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { PORT } from './config.js';
import { connectDB } from './db.js';
import { seedIfEmpty } from './seed.js';
import { migrate } from './migrate.js';
import { setupSockets } from './sockets.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';
import productRoutes from './routes/products.js';
import invoiceRoutes from './routes/invoices.js';
import reportRoutes from './routes/reports.js';
import promotionRoutes from './routes/promotions.js';
import settingsRoutes from './routes/settings.js';
import hardwareRoutes from './routes/hardware.js';
import rfidRoutes from './routes/rfid.js';
import tabRoutes from './routes/tabs.js';
import mailRoutes from './routes/mail.js';
import floorRoutes from './routes/floor.js';
import callRoutes from './routes/calls.js';
import buzzerRoutes from './routes/buzzer.js';
import { startDailyReportScheduler } from './dailyReport.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { imgSrc: ["'self'", 'data:', 'https:'], upgradeInsecureRequests: null },
    },
  }),
);
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/hardware', hardwareRoutes);
app.use('/api/rfid', rfidRoutes);
app.use('/api/tabs', tabRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/floor', floorRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/buzzer', buzzerRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

const dist = path.resolve(import.meta.dirname, '../../client/dist');
if (fs.existsSync(dist)) app.use(express.static(dist));

app.use((err, _req, res, _next) => {
  let status = err.status || 500;
  let message = err.message;
  if (err.name === 'ValidationError' || err.name === 'CastError') status = 400;
  if (err.code === 11000) {
    status = 409;
    message = `Already exists: ${Object.keys(err.keyValue || {}).join(', ')}`;
  }
  if (status >= 500) {
    console.error(err);
    message = 'Internal server error';
  }
  if (!res.headersSent) res.status(status).json({ error: message });
});

setupSockets(io);
await connectDB();
await migrate();
await seedIfEmpty();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, resolve);
});
console.log(`Smart POS server running on http://localhost:${PORT}`);
startDailyReportScheduler();
 