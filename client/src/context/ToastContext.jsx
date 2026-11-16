

import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const ToastContext = createContext(() => {});

const STYLES = {
  success: { icon: CheckCircle2, cls: 'border-emerald-500/30 text-emerald-300' },
  error: { icon: AlertCircle, cls: 'border-rose-500/30 text-rose-300' },
  info: { icon: Info, cls: 'border-indigo-500/30 text-indigo-300' },
};

let seq = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((msg, type = 'info') => {
    const id = ++seq;
    setItems((s) => [...s.slice(-3), { id, msg, type }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2">
        <AnimatePresence>
          {items.map((t) => {
            const { icon: Icon, cls } = STYLES[t.type] || STYLES.info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className={`flex items-center gap-2 rounded-xl border bg-slate-900 px-4 py-3 text-sm font-medium shadow-2xl ${cls}`}
              >
                <Icon size={18} />
                <span className="text-slate-100">{t.msg}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
 