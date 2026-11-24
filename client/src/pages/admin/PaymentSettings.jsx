
import { useEffect, useState } from 'react';
import { Coins, CreditCard, Save } from 'lucide-react';
import { METHODS } from '../../components/PaymentModal';
import { PageHeader, Toggle } from '../../components/ui';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { ImageUpload } from './Settings';

const DEFAULT_METHODS = { cash: true, card: true, qr: true };
const DESCRIPTIONS = {
  cash: 'Accept cash and calculate change at checkout.',
  card: 'Accept debit and credit cards on your bank card terminal.',
  qr: 'Accept DuitNow QR and e-wallets. The customer display shows your QR code with the amount due.',
};

const fromSettings = (settings) => ({
  methods: settings.paymentMethods ?? DEFAULT_METHODS,
  cashRounding: settings.cashRounding !== false,
  qrImage: settings.qrImage || '',
});

export default function PaymentSettings() {
  const { settings, setSettings } = useSettings();
  const toast = useToast();
  const [form, setForm] = useState(() => fromSettings(settings));
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(fromSettings(settings)), [settings.paymentMethods, settings.cashRounding, settings.qrImage]);

  const saved = fromSettings(settings);
  const dirty =
    form.cashRounding !== saved.cashRounding ||
    form.qrImage !== saved.qrImage ||
    METHODS.some(({ id }) => !!form.methods[id] !== !!saved.methods[id]);

  const toggle = (id, enabled) => {
    if (!enabled && Object.values(form.methods).filter(Boolean).length === 1) {
      toast('At least one payment method must remain enabled', 'error');
      return;
    }
    setForm((current) => ({ ...current, methods: { ...current.methods, [id]: enabled } }));
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api('/settings', { method: 'PUT', body: { paymentMethods: form.methods, cashRounding: form.cashRounding, qrImage: form.qrImage } });
      setSettings(result);
      toast('Payment options saved', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Payment Options" subtitle="Choose which payment methods are available at checkout" />
      <form onSubmit={save} className="max-w-3xl">
        <div className="divide-y divide-white/10 border-y border-white/10">
          {METHODS.map(({ id, label, icon: Icon, color }) => (
            <div key={id} className="py-5">
              <div className="flex items-center gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg" style={{ color, background: `${color}22` }}>
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{label}</h2>
                  <p className="mt-1 text-sm text-slate-400">{DESCRIPTIONS[id]}</p>
                </div>
                <Toggle checked={!!form.methods[id]} onChange={(enabled) => toggle(id, enabled)} label={form.methods[id] ? 'Enabled' : 'Disabled'} />
              </div>
              {id === 'qr' && form.methods.qr && (
                <div className="mt-4 pl-[60px]">
                  <ImageUpload label="Your DuitNow QR code" value={form.qrImage} onChange={(qrImage) => setForm((current) => ({ ...current, qrImage }))} />
                  {!form.qrImage && <p className="mt-2 text-xs text-amber-400">Upload the QR image from your bank or e-wallet merchant app so customers can scan it on the customer display.</p>}
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center gap-4 py-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg" style={{ color: '#f59e0b', background: '#f59e0b22' }}>
              <Coins size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Round cash bills to 5 sen</h2>
              <p className="mt-1 text-sm text-slate-400">Bank Negara Malaysia rounding: totals ending in 1, 2, 6 or 7 sen round down; 3, 4, 8 or 9 sen round up. Card and QR are charged the exact amount.</p>
            </div>
            <Toggle checked={form.cashRounding} onChange={(cashRounding) => setForm((current) => ({ ...current, cashRounding }))} label={form.cashRounding ? 'On' : 'Off'} />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button className="btn btn-primary" disabled={busy || !dirty}>
            {busy ? <CreditCard size={16} /> : <Save size={16} />}
            {busy ? 'Saving...' : 'Save payment options'}
          </button>
        </div>
      </form>
    </>
  );
}
