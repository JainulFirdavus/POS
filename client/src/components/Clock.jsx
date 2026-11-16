
import { useEffect, useState } from 'react';

export default function Clock({ className = '', big = false }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={className}>
      <div className={`font-semibold tabular-nums ${big ? 'text-2xl' : 'text-sm'}`}>
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: big ? undefined : '2-digit' })}
      </div>
      <div className={`text-slate-400 ${big ? 'text-sm' : 'text-xs'}`}>
        {now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
      </div>
    </div>
  );
} 