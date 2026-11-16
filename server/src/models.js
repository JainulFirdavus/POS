
import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const emptyToUndefined = (v) => (v === '' || v == null ? undefined : v);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    role: { type: String, enum: ['admin', 'cashier'], default: 'cashier' },
    secretHash: { type: String, required: true },
    color: { type: String, default: '#10b981' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
userSchema.set('toJSON', {
  transform: (_doc, obj) => {
    delete obj.secretHash;
    return obj;
  },
});
export const User = model('User', userSchema);

export const Category = model(
  'Category',
  new Schema(
    {
      name: { type: String, required: true, trim: true, unique: true, maxlength: 40 },
      emoji: { type: String, default: '🛒' },
      color: { type: String, default: '#6366f1' },
      order: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
);

export const Product = model(
  'Product',
  new Schema(
    {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      sku: { type: String, trim: true, unique: true, sparse: true, set: emptyToUndefined },
      barcode: { type: String, trim: true, index: true },
      category: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
      price: { type: Number, required: true, min: 0 },
      cost: { type: Number, default: 0, min: 0 },
      stock: { type: Number, default: 0 },
      lowStock: { type: Number, default: 5, min: 0 },
      emoji: { type: String, default: '📦' },
      color: { type: String, default: '#6366f1' },
      favorite: { type: Boolean, default: false },
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);

const lineSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    sku: String,
    qty: Number,
    price: Number,
    cost: Number,
    total: Number,
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    number: { type: String, unique: true },
    items: [lineSchema],
    subtotal: Number,
    discount: { type: Number, default: 0 },
    taxRate: Number,
    tax: Number,
    total: Number,
    paymentMethod: { type: String, enum: ['cash', 'card', 'upi'] },
    paid: Number,
    change: Number,
    cashier: { id: { type: Schema.Types.ObjectId, ref: 'User' }, name: String },
    status: { type: String, enum: ['paid', 'void'], default: 'paid' },
    voidedAt: Date,
    voidedBy: String,
  },
  { timestamps: true },
);
invoiceSchema.index({ createdAt: -1 });
export const Invoice = model('Invoice', invoiceSchema);

export const Counter = model('Counter', new Schema({ _id: String, seq: Number }));

export const Promotion = model(
  'Promotion',
  new Schema(
    {
      title: { type: String, required: true, trim: true, maxlength: 80 },
      message: { type: String, trim: true, maxlength: 240 },
      emoji: { type: String, default: '🎉' },
      color: { type: String, default: '#8b5cf6' },
      image: { type: String, trim: true },
      active: { type: Boolean, default: true },
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
      order: { type: Number, default: 0 },
    },
    { timestamps: true },
  ),
);

export const Setting = model(
  'Setting',
  new Schema({
    storeName: { type: String, default: 'Smart POS', maxlength: 60 },
    address: { type: String, default: '', maxlength: 160 },
    logo: { type: String, default: '', maxlength: 1500000 },
    phone: { type: String, default: '', maxlength: 30 },
    currency: { type: String, default: 'INR', maxlength: 3 },
    taxRate: { type: Number, default: 5, min: 0, max: 100 },
    receiptFooter: { type: String, default: 'Thank you! Visit again.', maxlength: 160 },
    ticker: { type: String, default: '', maxlength: 400 },
    paymentMethods: {
      cash: { type: Boolean, default: true },
      card: { type: Boolean, default: true },
      upi: { type: Boolean, default: true },
    },
    dashboardTheme: { type: String, default: 'midnight', enum: ['midnight', 'forest', 'pearl', 'sky'] },
    sellerTheme: { type: String, default: 'midnight', enum: ['midnight', 'forest', 'pearl', 'sky'] },
  }),
);

export async function getSettings() {
  const settings = (await Setting.findOne().lean()) ?? (await Setting.create({})).toObject();
  return {
    ...settings,
    paymentMethods: {
      cash: settings.paymentMethods?.cash ?? true,
      card: settings.paymentMethods?.card ?? true,
      upi: settings.paymentMethods?.upi ?? true,
    },
  };
}
 