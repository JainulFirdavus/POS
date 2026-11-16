
import { useEffect, useState } from 'react';
import { CreditCard, Save } from 'lucide-react';
import { METHODS } from '../../components/PaymentModal';
import { PageHeader, Toggle } from '../../components/ui';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';

const DEFAULT_METHODS = { cash: true, card: true, upi: true };
const DESCRIPTIONS = {
  cash: 'Accept cash and calculate change at checkout.',
  card: 'Accept card payments at the terminal.',
  upi: 'Accept UPI and QR-code payments.',
};

export default function PaymentSettings() {
  const { settings, setSettings } = useSettings();
  const toast = useToast();
  const [methods, setMethods] = useState(settings.paymentMethods ?? DEFAULT_METHODS);
  const [busy, setBusy] = useState(false);

  useEffect(() => setMethods(settings.paymentMethods ?? DEFAULT_METHODS), [settings.paymentMethods]);

  const toggle = (id, enabled) => {
    if (!enabled && Object.values(methods).filter(Boolean).length === 1) {
      toast('At least one payment method must remain enabled', 'error');
      return;
    }
    setMethods((current) => ({ ...current, [id]: enabled }));
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await api('/settings', { method: 'PUT', body: { paymentMethods: methods } });
      setSettings(saved);
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
            <div key={id} className="flex items-center gap-4 py-5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg" style={{ color, background: `${color}22` }}>
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{label}</h2>
                <p className="mt-1 text-sm text-slate-400">{DESCRIPTIONS[id]}</p>
              </div>
              <Toggle checked={!!methods[id]} onChange={(enabled) => toggle(id, enabled)} label={methods[id] ? 'Enabled' : 'Disabled'} />
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button className="btn btn-primary" disabled={busy || Object.keys(methods).every((id) => methods[id] === (settings.paymentMethods ?? DEFAULT_METHODS)[id])}>
            {busy ? <CreditCard size={16} /> : <Save size={16} />}
            {busy ? 'Saving...' : 'Save payment options'}
          </button>
        </div>
      </form>
    </>
  );
}
