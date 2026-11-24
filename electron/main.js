import { app, BrowserWindow, screen, shell } from 'electron';
import path from 'node:path';

const DEV = process.env.POS_DEV === '1';
const PORT = process.env.PORT || 4000;

async function createWindows() {
  if (app.isPackaged) process.env.DATA_DIR ??= path.join(app.getPath('userData'), 'data');
  if (!DEV) await import('../server/src/index.js');

  const base = DEV ? 'http://localhost:5173' : `http://localhost:${PORT}`;
  const primary = screen.getPrimaryDisplay();
  const secondary = screen.getAllDisplays().find((d) => d.id !== primary.id);
  const common = {
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  };

  const seller = new BrowserWindow({ ...common, ...primary.workArea, title: 'Smart POS - Seller' });
  seller.loadURL(`${base}/#/login`);

  const customer = new BrowserWindow({
    ...common,
    title: 'Smart POS - Customer Display',
    ...(secondary ? { ...secondary.bounds, frame: false } : { width: 1024, height: 640 }),
  });
  customer.loadURL(`${base}/#/customer`);
  if (secondary) customer.once('ready-to-show', () => customer.setFullScreen(true));

  for (const w of [seller, customer]) {
    w.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(base)) return { action: 'allow' };
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  }
  seller.on('closed', () => app.quit());
}

app.whenReady().then(createWindows);
app.on('window-all-closed', () => app.quit());
