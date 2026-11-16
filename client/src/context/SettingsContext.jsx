
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ storeName: 'Smart POS', currency: 'INR', taxRate: 0, ticker: '' });

  const reload = useCallback(() => api('/settings').then(setSettings).catch(() => {}), []);

  useEffect(() => {
    reload();
    const s = getSocket();
    s.on('settings:update', setSettings);
    return () => s.off('settings:update', setSettings);
  }, [reload]);

  const money = useMemo(() => {
    let f;
    try {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency || 'INR' });
    } catch {
      f = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return (v) => f.format(Number(v) || 0);
  }, [settings.currency]);

  return <SettingsContext.Provider value={{ settings, setSettings, money, reload }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext); 