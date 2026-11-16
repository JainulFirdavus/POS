
import { createPortal } from 'react-dom';

const Divider = () => <div className="my-2 border-t border-dashed border-slate-400" />;

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-sm font-bold' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ReceiptPaper({ invoice, settings, money }) {
  return (
    <div className="bg-white p-4 font-mono text-[12px] leading-relaxed text-slate-900">
      <div className="text-center">
        {settings.logo && <img src={settings.logo} alt="" className="mx-auto mb-2 h-12 max-w-24 object-contain" />}
        <div className="text-base font-bold">{settings.storeName}</div>
        {settings.address && <div>{settings.address}</div>}
        {settings.phone && <div>Tel: {settings.phone}</div>}
      </div>
      <Divider />
      <Row label={invoice.number} value={new Date(invoice.createdAt).toLocaleString()} />
      <div>Cashier: {invoice.cashier?.name}</div>
      <Divider />
      {invoice.items.map((it, i) => (
        <div key={i}>
          <div>{it.name}</div>
          <Row label={`  ${it.qty} x ${money(it.price)}`} value={money(it.total)} />
        </div>
      ))}
      <Divider />
      <Row label="Subtotal" value={money(invoice.subtotal)} />
      {invoice.discount > 0 && <Row label="Discount" value={`-${money(invoice.discount)}`} />}
      <Row label={`Tax (${invoice.taxRate}%)`} value={money(invoice.tax)} />
      <Row label="TOTAL" value={money(invoice.total)} bold />
      <Row label={`Paid (${invoice.paymentMethod?.toUpperCase()})`} value={money(invoice.paid)} />
      {invoice.change > 0 && <Row label="Change" value={money(invoice.change)} />}
      <Divider />
      {invoice.status === 'void' && <div className="text-center font-bold text-red-600">*** VOID ***</div>}
      <div className="text-center">{settings.receiptFooter}</div>
    </div>
  );
}

export function PrintPortal({ children }) {
  return createPortal(
    <div id="print-area" className="hidden">
      {children}
    </div>,
    document.body,
  );
}
 