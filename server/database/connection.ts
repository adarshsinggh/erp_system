import knex, { Knex } from 'knex';
import config from './knexfile';

let db: Knex | null = null;

export function getDb(): Knex {
  if (!db) {
    db = knex(config);
  }
  return db;
}

export async function initializeDb(): Promise<void> {
  const database = getDb();

  try {
    await database.raw('SELECT 1');
    console.log('[DB] Connected to PostgreSQL successfully');
  } catch (error) {
    console.error('[DB] Failed to connect to PostgreSQL:', error);
    throw error;
  }

  await database.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await database.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  console.log('[DB] Extensions verified');
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
    console.log('[DB] Connection closed');
  }
}
