
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Link, useLocation, useOutlet } from 'react-router-dom';
import { CreditCard, FileDown, Grid3x3, LayoutDashboard, LayoutTemplate, LogOut, Mail, Megaphone, Monitor, Nfc, Package, Printer, Receipt, Settings, ShoppingCart, Users, Vault } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Products & Stock', icon: Package },
  { to: '/admin/invoices', label: 'Invoices', icon: Receipt },
  { to: '/admin/dine-in', label: 'Dine-in & RFID', icon: Nfc },
  { to: '/admin/floor', label: 'Floor Plan & Buzzers', icon: Grid3x3 },
  { to: '/admin/drawer', label: 'Cash Drawer', icon: Vault },
  { to: '/admin/reports', label: 'Reports & Export', icon: FileDown },
  { to: '/admin/promotions', label: 'Promotions', icon: Megaphone },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/settings', label: 'Settings', icon: Settings, end: true },
  { to: '/admin/settings/pos-layout', label: 'POS Layout', icon: LayoutTemplate, nested: true },
  { to: '/admin/settings/payments', label: 'Payment Options', icon: CreditCard, nested: true },
  { to: '/admin/settings/printer', label: 'Printer & Drawer', icon: Printer, nested: true },
  { to: '/admin/settings/email', label: 'Daily Email', icon: Mail, nested: true },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <motion.div data-theme={settings.dashboardTheme || 'midnight'} className="pos-themed flex h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/5 bg-slate-900/60 p-4">
        <div className="mb-8 flex items-center gap-3 px-2">
          {settings.logo ? <img src={settings.logo} alt="" className="h-10 w-10 rounded-xl bg-paper object-contain p-1" /> : <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xl">🛒</div>}
          <div className="min-w-0">
            <div className="truncate font-bold">{settings.storeName}</div>
            <div className="text-xs text-indigo-300">Admin Panel</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="relative block">
              {({ isActive }) => (
                <div className={`relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors ${n.nested ? 'ml-5 px-3' : 'px-3'} ${isActive ? 'text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                  {isActive && <motion.span layoutId="admin-nav" className="absolute inset-0 rounded-xl bg-indigo-500/20 ring-1 ring-indigo-400/40" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <n.icon size={18} className="relative" />
                  <span className="relative">{n.label}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2">
          <Link to="/pos" target="_blank" rel="noopener noreferrer" className="btn btn-success w-full"><ShoppingCart size={16} /> Open POS</Link>
          <button onClick={() => window.open('#/customer', 'customer-display', 'popup,noopener,width=1280,height=720')} className="btn btn-ghost w-full">
            <Monitor size={16} /> Customer Display
          </button>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-500 text-sm font-bold text-on-accent">{user.name[0]}</div>
            <span className="flex-1 truncate text-sm">{user.name}</span>
            <button onClick={logout} title="Logout" className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mx-auto max-w-7xl p-8"
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
    </motion.div>
  );
}
