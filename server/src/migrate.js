import { Invoice, Setting } from './models.js';

// One-time, idempotent data migrations run on every start-up.
export async function migrate() {
  // The QR payment method was stored as "upi" (India). It is now "qr" (DuitNow QR / e-wallets).
  // Uses the raw collections because "upi" is no longer in the schemas, so Mongoose would strip it.
  await Invoice.collection.updateMany({ paymentMethod: 'upi' }, { $set: { paymentMethod: 'qr' } });
  const legacy = await Setting.collection.find({ 'paymentMethods.upi': { $exists: true } }).toArray();
  for (const s of legacy) {
    await Setting.collection.updateOne(
      { _id: s._id },
      { $set: { 'paymentMethods.qr': s.paymentMethods.qr ?? s.paymentMethods.upi }, $unset: { 'paymentMethods.upi': '' } },
    );
  }
}
