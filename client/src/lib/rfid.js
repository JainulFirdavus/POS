import { useEffect, useRef } from 'react';

export const normUid = (uid) => String(uid ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
export const looksLikeCard = (s) => /^[0-9A-Za-z:\- ]{4,64}$/.test(String(s).trim());

// USB RFID / NFC readers act as a keyboard: they type the card number in a few milliseconds and press Enter.
// This listens for that burst anywhere on the page (outside text fields, which handle their own input).
export function useCardScanner(onScan, enabled = true) {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let last = 0;
    const onKey = (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const now = performance.now();
      if (now - last > 80) buffer = '';
      last = now;
      if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          e.preventDefault();
          e.stopPropagation();
          handler.current(buffer);
        }
        buffer = '';
      } else if (e.key.length === 1 && /[0-9A-Za-z]/.test(e.key)) {
        buffer += e.key;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}
