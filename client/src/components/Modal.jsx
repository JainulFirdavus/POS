
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div
            className={`relative flex max-h-[92vh] w-full ${width} flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl`}
            initial={{ y: 30, scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <h3 className="text-lg font-bold">{title}</h3>
                {onClose && (
                  <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white">
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="overflow-y-auto p-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-white/5 px-5 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

 