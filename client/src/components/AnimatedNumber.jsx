import { useEffect, useLayoutEffect, useRef } from 'react';
import { animate } from 'framer-motion';

const defaultFormat = (v) => Math.round(v).toLocaleString();

// Tweens the DOM text directly so counting up never triggers React re-renders.
export default function AnimatedNumber({ value, format = defaultFormat, className }) {
  const ref = useRef(null);
  const prev = useRef(value);
  const fmt = useRef(format);
  fmt.current = format;

  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = format(prev.current);
  }, [format]);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.45,
      ease: 'easeOut',
      onUpdate: (v) => {
        prev.current = v;
        if (ref.current) ref.current.textContent = fmt.current(v);
      },
    });
    return () => controls.stop();
  }, [value]);

  return <span ref={ref} className={className} />;
} 