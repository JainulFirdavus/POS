
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.js';

// Each register ("terminal") has a seller window and a customer display sharing one room.
export function setupSockets(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.user = jwt.verify(token, JWT_SECRET);
      } catch {
        /* unauthenticated sockets may only listen */
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    const terminal = String(socket.handshake.query.terminal || '1').slice(0, 20);
    const room = `terminal:${terminal}`;
    socket.join(room);

    const authed = (fn) => (data) => {
      if (socket.user && data && typeof data === 'object') fn(data);
    };

    socket.on('cart:update', authed((data) => socket.to(room).emit('cart:update', data)));
    socket.on('sale:complete', authed((data) => socket.to(room).emit('sale:complete', data)));
    socket.on(
      'display:message',
      authed((data) => {
        const msg = { text: String(data.text ?? '').slice(0, 200), duration: Math.min(Number(data.duration) || 8000, 120000) };
        // A QR prompt asks the customer display to show the shop's DuitNow QR with the amount due.
        if (data.kind === 'qr' && Number.isFinite(Number(data.amount))) Object.assign(msg, { kind: 'qr', amount: Number(data.amount) });
        (data.broadcast && socket.user.role === 'admin' ? socket.broadcast : socket.to(room)).emit('display:message', msg);
      }),
    );
    socket.on('display:request', () => socket.to(room).emit('display:request'));
  });
} 