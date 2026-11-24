import { useEffect, useState } from 'react';
import { Globe, Printer, RefreshCw, Save, Usb, Vault, Wifi } from 'lucide-react';
import { Field, PageHeader, Toggle } from '../../components/ui';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';

const DEFAULTS = { mode: 'browser', host: '', port: 9100, systemName: '', width: 80, autoPrint: true, openDrawerOnCash: true, drawerPin: 0 };
const MODES = [
  { id: 'network', label: 'Network printer', icon: Wifi, desc: 'Thermal printer on the shop LAN / Wi-Fi (ESC/POS, port 9100). Most reliable, and opens the drawer.' },
  { id: 'system', label: 'USB printer', icon: Usb, desc: 'Thermal printer plugged into this computer by USB (macOS / Linux). Prints and opens the drawer.' },
  { id: 'browser', label: 'Print dialog only', icon: Globe, desc: 'Use the normal print window. The app cannot open the drawer itself; drawer opens are still logged.' },
];

export default function PrinterSettings() {
  const { settings, setSettings } = useSettings();
  const toast = useToast();
  const [f, setF] = useState({ ...DEFAULTS, ...settings.printer });
  const [printers, setPrinters] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => setF({ ...DEFAULTS, ...settings.printer }), [settings.printer]);
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));
  const saved = { ...DEFAULTS, ...settings.printer };
  const dirty = Object.keys(DEFAULTS).some((k) => String(saved[k]) !== String(f[k]));

  const loadPrinters = () =>
    api('/hardware/printers')
      .then((r) => {
        setPrinters(r.printers);
        setF((cur) => (cur.systemName || !r.default ? cur : { ...cur, systemName: r.default }));
      })
      .catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    if (f.mode === 'system' && printers === null) loadPrinters();
  }, [f.mode]);

  const save = async (e) => {
    e?.preventDefault();
    setBusy('save');
    try {
      const saved = await api('/settings', { method: 'PUT', body: { printer: { ...f, port: Number(f.port) } } });
      setSettings(saved);
      toast('Printer settings saved', 'success');
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    } finally {
      setBusy('');
    }
  };

  const test = async (what) => {
    if (dirty && !(await save())) return;
    setBusy(what);
    try {
      await api('/hardware/test', { method: 'POST', body: { what } });
      toast(what === 'drawer' ? 'Drawer open signal sent' : 'Test page sent to printer', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const hw = f.mode !== 'browser';

  return (
    <>
      <PageHeader title="Printer & Cash Drawer" subtitle="Connect a receipt printer; the cash drawer is opened through the printer" />
      <form onSubmit={save} className="max-w-4xl space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => set('mode', m.id)} aria-pressed={f.mode === m.id} className={`rounded-2xl border p-4 text-left transition ${f.mode === m.id ? 'border-indigo-400 bg-indigo-500/10 ring-2 ring-indigo-500/30' : 'border-white/10 hover:border-white/25'}`}>
              <m.icon size={22} className={f.mode === m.id ? 'text-indigo-300' : 'text-slate-400'} />
              <div className="mt-2 font-semibold">{m.label}</div>
              <p className="mt-1 text-xs text-slate-400">{m.desc}</p>
            </button>
          ))}
        </div>

        <div className="card grid grid-cols-2 gap-5 p-6">
          {f.mode === 'network' && (
            <>
              <Field label="Printer IP address"><input className="input" placeholder="192.168.1.100" value={f.host} onChange={(e) => set('host', e.target.value)} /></Field>
              <Field label="Port"><input className="input" type="number" min="1" max="65535" value={f.port} onChange={(e) => set('port', e.target.value)} /></Field>
              <p className="col-span-2 -mt-2 text-xs text-slate-400">Hold the printer’s FEED button while switching it on to print its self-test page, which shows its IP address. Give it a fixed IP in your router.</p>
            </>
          )}
          {f.mode === 'system' && (
            <Field label="USB printer" className="col-span-2">
              <div className="flex gap-2">
                <select className="input" value={f.systemName} onChange={(e) => set('systemName', e.target.value)}>
                  <option value="">Choose a printer...</option>
                  {f.systemName && !printers?.includes(f.systemName) && <option value={f.systemName}>{f.systemName}</option>}
                  {printers?.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button type="button" title="Refresh list" className="btn btn-ghost px-3" onClick={loadPrinters}><RefreshCw size={16} /></button>
              </div>
              <p className="mt-2 text-xs text-slate-400">First add the printer in System Settings → Printers & Scanners (choose the “Generic” or “Raw” driver if offered). It then appears here.</p>
            </Field>
          )}
          {f.mode === 'browser' && <p className="col-span-2 text-sm text-slate-400">Receipts print through the print window. If your printer driver has an “open cash drawer” option, turn it on there and the drawer will open as receipts print.</p>}

          <Field label="Paper width">
            <select className="input" value={f.width} onChange={(e) => set('width', Number(e.target.value))}>
              <option value={80}>80 mm (48 characters)</option>
              <option value={58}>58 mm (32 characters)</option>
            </select>
          </Field>
          <Field label="Drawer connector">
            <select className="input" value={f.drawerPin} onChange={(e) => set('drawerPin', Number(e.target.value))} disabled={!hw}>
              <option value={0}>Pin 2 (standard)</option>
              <option value={1}>Pin 5 (try if the drawer does not open)</option>
            </select>
          </Field>

          <div className="col-span-2 space-y-4 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Print receipt automatically after each sale</div>
                <div className="text-sm text-slate-400">{hw ? 'The receipt prints as soon as the sale is completed.' : 'Needs a network or USB printer.'}</div>
              </div>
              <Toggle checked={f.autoPrint} onChange={(v) => set('autoPrint', v)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Open cash drawer on cash sales</div>
                <div className="text-sm text-slate-400">Card and QR payments do not open the drawer. Every open is logged under Cash Drawer.</div>
              </div>
              <Toggle checked={f.openDrawerOnCash} onChange={(v) => set('openDrawerOnCash', v)} />
            </div>
          </div>

          <div className="col-span-2 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-5">
            <button type="button" className="btn btn-ghost" disabled={!hw || !!busy} onClick={() => test('print')}><Printer size={16} /> {busy === 'print' ? 'Printing...' : 'Print test page'}</button>
            <button type="button" className="btn btn-ghost" disabled={!hw || !!busy} onClick={() => test('drawer')}><Vault size={16} /> {busy === 'drawer' ? 'Opening...' : 'Test drawer'}</button>
            <button className="btn btn-primary" disabled={!!busy || !dirty}><Save size={16} /> {busy === 'save' ? 'Saving...' : 'Save'}</button>
          </div>
        </div>

        <div className="card p-6 text-sm text-slate-300">
          <h2 className="mb-3 font-semibold text-white">How to connect the hardware</h2>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Plug the <b>cash drawer cable (RJ11, like a phone plug)</b> into the port marked <b>DK</b> or <b>Cash Drawer</b> on the back of the receipt printer, not into the computer.</li>
            <li>Connect the printer to the shop network (LAN cable) or to this computer (USB) and choose the matching option above.</li>
            <li>Press <b>Print test page</b>, then <b>Test drawer</b>. If the drawer does not open, switch the drawer connector to pin 5.</li>
            <li>Cashiers can open the drawer without a sale from the POS (drawer button in the top bar). They must give a reason, and it is logged.</li>
          </ol>
        </div>
      </form>
    </>
  );
}
