
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { DATA_DIR } from './config.js';

export async function connectDB() {
  let uri = process.env.MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const dbPath = path.join(DATA_DIR, 'db');
    fs.mkdirSync(dbPath, { recursive: true });
    console.log('No MONGO_URI set - starting embedded MongoDB (first run downloads the binary)...');
    const mongod = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger' } });
    uri = mongod.getUri('pos');
    console.log(`Embedded MongoDB data: ${dbPath}`);
  }
  await mongoose.connect(uri);
}
 