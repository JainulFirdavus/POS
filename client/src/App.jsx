
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import POS from './pages/POS';
import CustomerDisplay from './pages/CustomerDisplay';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Products from './pages/admin/Products';
import Invoices from './pages/admin/Invoices';
import Reports from './pages/admin/Reports';
import Promotions from './pages/admin/Promotions';
import Users from './pages/admin/Users';
import Settings from './pages/admin/Settings';
import PaymentSettings from './pages/admin/PaymentSettings';
import PrinterSettings from './pages/admin/PrinterSettings';
import PosLayout from './pages/admin/PosLayout';
import EmailSettings from './pages/admin/EmailSettings';
import DineIn from './pages/admin/DineIn';
import CashDrawer from './pages/admin/CashDrawer';

function Protected({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/pos" replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname.split('/')[1]}>
          <Route path="/login" element={<Login />} />
          <Route path="/customer" element={<CustomerDisplay />} />
          <Route path="/pos" element={<Protected><POS /></Protected>} />
          <Route path="/admin" element={<Protected role="admin"><AdminLayout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="reports" element={<Reports />} />
            <Route path="promotions" element={<Promotions />} />
            <Route path="users" element={<Users />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/payments" element={<PaymentSettings />} />
            <Route path="settings/printer" element={<PrinterSettings />} />
            <Route path="settings/pos-layout" element={<PosLayout />} />
            <Route path="settings/email" element={<EmailSettings />} />
            <Route path="dine-in" element={<DineIn />} />
            <Route path="drawer" element={<CashDrawer />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AnimatePresence>
    </MotionConfig>
  );
}