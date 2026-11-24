
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
    category: { type: Schema.Types.ObjectId, ref: 'Category' },
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
    taxLabel: String,
    tax: Number,
    rounding: { type: Number, default: 0 },
    total: Number,
    paymentMethod: { type: String, enum: ['cash', 'card', 'qr'] },
    paid: Number,
    change: Number,
    cashier: { id: { type: Schema.Types.ObjectId, ref: 'User' }, name: String },
    status: { type: String, enum: ['paid', 'void'], default: 'paid' },
    orderType: { type: String, enum: ['takeaway', 'dine-in'], default: 'takeaway' },
    tab: { type: Schema.Types.ObjectId, ref: 'Tab' },
    table: String,
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
    currency: { type: String, default: 'MYR', maxlength: 3 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxLabel: { type: String, default: 'SST', trim: true, maxlength: 20 },
    taxNumber: { type: String, default: '', trim: true, maxlength: 40 },
    cashRounding: { type: Boolean, default: true },
    qrImage: { type: String, default: '', maxlength: 1500000 },
    receiptFooter: { type: String, default: 'Terima kasih! Thank you.', maxlength: 160 },
    ticker: { type: String, default: '', maxlength: 400 },
    paymentMethods: {
      cash: { type: Boolean, default: true },
      card: { type: Boolean, default: true },
      qr: { type: Boolean, default: true },
    },
    dashboardTheme: { type: String, default: 'midnight', enum: ['midnight', 'forest', 'ember', 'pearl', 'sky', 'sunrise'] },
    sellerTheme: { type: String, default: 'midnight', enum: ['midnight', 'forest', 'ember', 'pearl', 'sky', 'sunrise'] },
    printer: {
      // browser: the OS print dialog; network: ESC/POS over TCP (port 9100); system: raw ESC/POS through CUPS (USB printers on macOS/Linux).
      mode: { type: String, enum: ['browser', 'network', 'system'], default: 'browser' },
      host: { type: String, default: '', trim: true, maxlength: 255 },
      port: { type: Number, default: 9100, min: 1, max: 65535 },
      systemName: { type: String, default: '', trim: true, maxlength: 120 },
      width: { type: Number, enum: [58, 80], default: 80 },
      autoPrint: { type: Boolean, default: true },
      openDrawerOnCash: { type: Boolean, default: true },
      drawerPin: { type: Number, enum: [0, 1], default: 0 },
    },
    // Order type preselected on the POS for each new sale (cashiers can switch per order).
    defaultOrderType: { type: String, enum: ['dine-in', 'takeaway'], default: 'dine-in' },
    // POS screen layout, set by the admin and applied live on every register.
    posLayout: {
      view: { type: String, enum: ['grid', 'list'], default: 'grid' },
      tileSize: { type: String, enum: ['sm', 'md', 'lg', 'xl'], default: 'md' },
      menuPosition: { type: String, enum: ['left', 'top', 'bottom'], default: 'left' },
      menuSize: { type: String, enum: ['sm', 'md', 'lg'], default: 'md' },
      cartWidth: { type: String, enum: ['sm', 'md', 'lg'], default: 'md' },
      showStock: { type: Boolean, default: true },
    },
  }),
);

export const POS_LAYOUT_DEFAULTS = { view: 'grid', tileSize: 'md', menuPosition: 'left', menuSize: 'md', cartWidth: 'md', showStock: true };

export const PRINTER_DEFAULTS = { mode: 'browser', host: '', port: 9100, systemName: '', width: 80, autoPrint: true, openDrawerOnCash: true, drawerPin: 0 };

// Every cash-drawer open is logged so the admin can audit how often, why and by whom the drawer was opened.
const drawerEventSchema = new Schema(
  {
    reason: { type: String, enum: ['sale', 'no-sale', 'test'], required: true },
    note: { type: String, trim: true, maxlength: 160 },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    invoiceNumber: String,
    amount: Number,
    user: { id: { type: Schema.Types.ObjectId, ref: 'User' }, name: String },
    device: { type: String, enum: ['browser', 'network', 'system'] },
    ok: { type: Boolean, default: true },
    error: String,
  },
  { timestamps: true },
);
drawerEventSchema.index({ createdAt: -1 });
export const DrawerEvent = model('DrawerEvent', drawerEventSchema);

export const RfidCard = model(
  'RfidCard',
  new Schema(
    {
      uid: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 64 },
      label: { type: String, required: true, trim: true, maxlength: 40 },
      color: { type: String, default: '#f59e0b' },
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);

const tabItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    sku: String,
    category: { type: Schema.Types.ObjectId, ref: 'Category' },
    emoji: String,
    price: Number,
    cost: Number,
    qty: Number,
    custom: { type: Boolean, default: false },
    from: String, // label of the tab this item was moved or merged from
    addedBy: String,
    addedAt: { type: Date, default: Date.now },
  },
);

// A dine-in tab is opened by tapping an RFID card; orders are added over the meal and it is closed on payment.
const tabSchema = new Schema(
  {
    card: { type: Schema.Types.ObjectId, ref: 'RfidCard', required: true },
    cardUid: { type: String, required: true },
    label: String,
    color: String,
    guests: { type: Number, default: 1, min: 1, max: 99 },
    note: { type: String, trim: true, maxlength: 160 },
    items: [tabItemSchema],
    status: { type: String, enum: ['open', 'closed', 'cancelled', 'merged'], default: 'open' },
    mergedInto: { type: Schema.Types.ObjectId, ref: 'Tab' },
    openedBy: { id: { type: Schema.Types.ObjectId, ref: 'User' }, name: String },
    closedAt: Date,
    closedBy: String,
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  },
  { timestamps: true },
);
// At most one open tab per card.
tabSchema.index({ card: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });
export const Tab = model('Tab', tabSchema);

// SMTP credentials live apart from Setting because GET /api/settings is public (the customer display reads it).
export const MailConfig = model(
  'MailConfig',
  new Schema({
    enabled: { type: Boolean, default: false },
    host: { type: String, default: '', trim: true, maxlength: 255 },
    port: { type: Number, default: 587, min: 1, max: 65535 },
    secure: { type: Boolean, default: false },
    user: { type: String, default: '', trim: true, maxlength: 255 },
    pass: { type: String, default: '', maxlength: 512 },
    from: { type: String, default: '', trim: true, maxlength: 255 },
    recipients: { type: [String], default: [] },
    sendTime: { type: String, default: '22:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    timezone: { type: String, default: '' },
    lastSentDate: { type: String, default: '' },
    lastSentAt: Date,
    lastError: { type: String, default: '' },
  }),
);

export async function getSettings() {
  const settings = (await Setting.findOne().lean()) ?? (await Setting.create({})).toObject();
  return {
    ...settings,
    taxLabel: settings.taxLabel || 'SST',
    taxNumber: settings.taxNumber ?? '',
    cashRounding: settings.cashRounding ?? true,
    qrImage: settings.qrImage ?? '',
    paymentMethods: {
      cash: settings.paymentMethods?.cash ?? true,
      card: settings.paymentMethods?.card ?? true,
      qr: settings.paymentMethods?.qr ?? true,
    },
    printer: { ...PRINTER_DEFAULTS, ...settings.printer },
    defaultOrderType: settings.defaultOrderType ?? 'dine-in',
    posLayout: { ...POS_LAYOUT_DEFAULTS, ...settings.posLayout },
  };
}
 