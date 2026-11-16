

import { io } from 'socket.io-client';
import { getToken } from './api';

let socket;

export const getTerminal = () => localStorage.getItem('pos_terminal') || '1';

export function getSocket() {
  socket ??= io({
    transports: ['websocket'],
    auth: (cb) => cb({ token: getToken() }),
    query: { terminal: getTerminal() },
  });
  return socket;
}

export function reconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}
