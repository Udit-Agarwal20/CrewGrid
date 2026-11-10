import { MongoClient, Db } from 'mongodb';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(customUri?: string, customDbName?: string): Promise<{ client: MongoClient; db: Db }> {
  if (client && db) {
    return { client, db };
  }

  const uri = customUri || env.MONGODB_URI;
  const dbName = customDbName || env.MONGODB_DB;

  logger.info({ uri: uri.replace(/\/\/.*@/, '//<auth>@'), dbName }, 'Connecting to MongoDB replica set...');

  client = new MongoClient(uri, {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    retryWrites: true,
    writeConcern: { w: 'majority' }
  });

  await client.connect();
  db = client.db(dbName);

  // Ping to verify connection & replica set
  const isMaster = await db.admin().command({ isMaster: 1 });
  logger.info(
    {
      setName: isMaster.setName,
      isMaster: isMaster.ismaster,
      isSecondary: isMaster.secondary,
      me: isMaster.me
    },
    'MongoDB replica set connected successfully'
  );

  return { client, db };
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return db;
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoClient not connected. Call connectToDatabase() first.');
  }
  return client;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed.');
  }
}

