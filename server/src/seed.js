
import bcrypt from 'bcryptjs';
import { Category, Product, Promotion, Setting, User } from './models.js';

const CATALOG = [
  {
    cat: { name: 'Beverages', emoji: '☕', color: '#f59e0b' },
    items: [
      ['Cappuccino', '☕', 120, 45, true],
      ['Cafe Latte', '🥛', 140, 50],
      ['Masala Chai', '🍵', 40, 12, true],
      ['Cold Coffee', '🧋', 150, 55],
      ['Fresh Lime Soda', '🍋', 60, 15],
      ['Mango Smoothie', '🥭', 130, 45],
    ],
  },
  {
    cat: { name: 'Bakery', emoji: '🥐', color: '#ec4899' },
    items: [
      ['Croissant', '🥐', 90, 35, true],
      ['Chocolate Muffin', '🧁', 80, 30],
      ['Cheesecake', '🍰', 180, 70],
      ['Garlic Bread', '🥖', 110, 35],
      ['Glazed Donut', '🍩', 70, 22],
    ],
  },
  {
    cat: { name: 'Fast Food', emoji: '🍔', color: '#ef4444' },
    items: [
      ['Veg Burger', '🍔', 160, 60, true],
      ['Chicken Burger', '🍗', 220, 90],
      ['Margherita Pizza', '🍕', 299, 110, true],
      ['Hot Dog', '🌭', 140, 50],
      ['Paneer Wrap', '🌯', 180, 65],
    ],
  },
  {
    cat: { name: 'Snacks', emoji: '🍿', color: '#8b5cf6' },
    items: [
      ['Popcorn', '🍿', 100, 25],
      ['Nachos', '🧀', 150, 50],
      ['French Fries', '🍟', 120, 35, true],
      ['Samosa', '🥟', 30, 10],
    ],
  },
  {
    cat: { name: 'Desserts', emoji: '🍨', color: '#06b6d4' },
    items: [
      ['Ice Cream Sundae', '🍨', 160, 55],
      ['Brownie', '🍫', 120, 40],
      ['Gulab Jamun', '🍮', 80, 25],
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
          barcode: `89010000${code}`,
          stock: n % 7 === 0 ? 3 : 25 + ((n * 13) % 75),
          lowStock: 5,
        };
      }),
    );
  }

  await Promotion.create([
    { title: 'Happy Hour', message: '20% off on all coffees between 4 PM - 6 PM', emoji: '☕', color: '#f59e0b', order: 1 },
    { title: 'Mega Combo', message: 'Burger + Fries + Drink at a special combo price!', emoji: '🍔', color: '#ef4444', order: 2 },
    { title: 'Join Rewards', message: 'Earn points on every purchase. Ask our cashier!', emoji: '⭐', color: '#8b5cf6', order: 3 },
  ]);

  await Setting.create({
    storeName: 'Smart POS Cafe',
    address: '12 MG Road, Bengaluru',
    phone: '+91 98765 43210',
    ticker: 'Welcome! Fresh bakery items every morning  •  Ask about our loyalty rewards  •  Free Wi-Fi available',
  });

  console.log('\nSeeded demo data:');
  console.log('  Admin login   -> username: admin  password: admin123');
  console.log('  Seller logins -> Firdavus PIN 1234, Suhain PIN 5678\n');
}
 