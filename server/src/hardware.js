import { DrawerEvent, getSettings } from './models.js';
import { drawerKick, receiptBuffer, sendRaw } from './printer.js';

// Opens the cash drawer (when a printer is connected) and always records the open in the audit log.
export async function openDrawer(io, { reason, note, invoice, user, settings }) {
  settings ??= await getSettings();
  const printer = settings.printer;
  let ok = true;
  let error;
  if (printer.mode !== 'browser') {
    try {
      await sendRaw(printer, drawerKick(printer.drawerPin));
    } catch (e) {
      ok = false;
      error = e.message;
    }
  }
  const event = await DrawerEvent.create({
    reason,
    note,
    invoice: invoice?._id,
    invoiceNumber: invoice?.number,
    amount: invoice?.total,
    user: { id: user.id, name: user.name },
    device: printer.mode,
    ok,
    error,
  });
  io.emit('drawer:changed');
  return event;
}

export async function printReceipt(invoice, { kick = false, settings } = {}) {
  settings ??= await getSettings();
  const parts = [receiptBuffer(invoice, settings)];
  if (kick) parts.unshift(drawerKick(settings.printer.drawerPin));
  await sendRaw(settings.printer, Buffer.concat(parts));
}

// Runs after every completed sale: prints the receipt and pops the drawer for cash, as one printer job.
// Never throws: the sale is already saved, so problems are reported back for the cashier to see.
export async function afterSale(io, invoice, user) {
  const settings = await getSettings();
  const printer = settings.printer;
  const kick = invoice.paymentMethod === 'cash' && printer.openDrawerOnCash;
  const print = printer.autoPrint && printer.mode !== 'browser';
  const result = { mode: printer.mode, printed: false, drawer: false, error: null };
  if (printer.mode !== 'browser' && (kick || print)) {
    try {
      if (print) await printReceipt(invoice, { kick, settings });
      else await sendRaw(printer, drawerKick(printer.drawerPin));
      result.printed = print;
      result.drawer = kick;
    } catch (e) {
      result.error = e.message;
    }
  }
  if (kick) {
    // In browser mode the drawer is popped by the printer driver when the receipt prints; it is still logged.
    await DrawerEvent.create({
      reason: 'sale',
      invoice: invoice._id,
      invoiceNumber: invoice.number,
      amount: invoice.total,
      user: { id: user.id, name: user.name },
      device: printer.mode,
      ok: !result.error,
      error: result.error ?? undefined,
    }).catch((e) => console.error('Could not log drawer open', e));
    io.emit('drawer:changed');
  }
  return result;
}
