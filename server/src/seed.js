
import bcrypt from 'bcryptjs';
import { Category, Product, Promotion, Setting, User } from './models.js';

// Demo catalogue for a Malaysian mini-mart. Prices in RM: [name, emoji, price, cost, favourite].
const CATALOG = [
  {
    cat: { name: 'Drinks', emoji: '🥤', color: '#f59e0b' },
    items: [
      ['Mineral Water 1.5L', '💧', 2.2, 1.3, true],
      ['Isotonic Drink 500ml', '🥤', 2.8, 1.8],
      ['Teh Tarik 3-in-1 (15 sachets)', '🍵', 14.9, 10.5],
      ['Chocolate Malt Drink 1kg', '🍫', 28.9, 22.0, true],
      ['Soy Milk 1L', '🥛', 4.5, 3.1],
      ['Instant Coffee 200g', '☕', 18.5, 13.4],
    ],
  },
  {
    cat: { name: 'Groceries', emoji: '🍚', color: '#10b981' },
    items: [
      ['Rice 5kg', '🍚', 26.9, 21.5, true],
      ['Cooking Oil 2kg', '🫗', 13.5, 10.6],
      ['Sugar 1kg', '🧂', 3.2, 2.7],
      ['Eggs Grade A (10)', '🥚', 6.2, 4.9, true],
      ['Instant Noodles Curry (5 pack)', '🍜', 5.9, 4.2],
    ],
  },
  {
    cat: { name: 'Snacks', emoji: '🍪', color: '#ec4899' },
    items: [
      ['Cream Crackers 400g', '🍘', 6.5, 4.6],
      ['Potato Chips 60g', '🥔', 3.9, 2.5, true],
      ['Chocolate Wafer', '🍫', 1.5, 0.9],
      ['Kuih Kapit (tin)', '🍪', 12.9, 8.8],
    ],
  },
  {
    cat: { name: 'Household', emoji: '🧴', color: '#6366f1' },
    items: [
      ['Dishwashing Liquid 900ml', '🧴', 6.9, 4.8],
      ['Laundry Detergent 2kg', '🧺', 19.9, 14.7, true],
      ['Tissue Box (5 pack)', '🧻', 9.9, 7.0],
      ['Trash Bags (30)', '🗑️', 5.5, 3.6],
    ],
  },
  {
    cat: { name: 'Personal Care', emoji: '🪥', color: '#06b6d4' },
    items: [
      ['Toothpaste 150g', '🪥', 7.9, 5.4],
      ['Shampoo 400ml', '🧴', 15.9, 11.2],
      ['Bath Soap (3 pack)', '🧼', 5.9, 3.9],
    ],
  },
];

export async function seedIfEmpty() {
  if ((await User.estimatedDocumentCount()) > 0) return;

  await User.create([
    { name: 'Store Admin', username: 'admin', role: 'admin', color: '#6366f1', secretHash: await bcrypt.hash('admin123', 10) },
    { name: 'Firdavus', username: 'firdavus', role: 'cashier', color: '#10b981', secretHash: await bcrypt.hash('1234', 10) },
    { name: 'Suhain', username: 'suhain', role: 'cashier', color: '#3b82f6', secretHash: await bcrypt.hash('5678', 10) },
  ]);

  let n = 1;
  for (const [i, group] of CATALOG.entries()) {
    const cat = await Category.create({ ...group.cat, order: i });
    await Product.create(
      group.items.map(([name, emoji, price, cost, favorite]) => {
        const code = String(n++).padStart(4, '0');
        return {
          name,
          emoji,
          price,
          cost,
          favorite: !!favorite,
          category: cat._id,
          color: cat.color,
          sku: `SKU-${code}`,
          barcode: `20000000${code}`,
          stock: n % 7 === 0 ? 3 : 25 + ((n * 13) % 75),
          lowStock: 5,
        };
      }),
    );
  }

  await Promotion.create([
    { title: 'Weekend Deal', message: 'Buy 2 Rice 5kg, save RM5 this Saturday and Sunday', emoji: '🍚', color: '#10b981', order: 1 },
    { title: 'Pay with DuitNow QR', message: 'Scan and pay with any banking or e-wallet app', emoji: '📱', color: '#ef4444', order: 2 },
    { title: 'Member Points', message: 'Earn points on every purchase. Ask our cashier!', emoji: '⭐', color: '#8b5cf6', order: 3 },
  ]);

  await Setting.create({
    storeName: 'Smart POS Mini Market',
    address: 'Jalan Contoh 1, 50000 Kuala Lumpur',
    phone: '+60 3-0000 0000',
    ticker: 'Selamat datang! Welcome!  •  We accept cash, card and DuitNow QR  •  Ask about member points',
  });

  console.log('\nSeeded demo data:');
  console.log('  Admin login   -> username: admin  password: admin123');
  console.log('  Seller logins -> Firdavus PIN 1234, Suhain PIN 5678\n');
}
 