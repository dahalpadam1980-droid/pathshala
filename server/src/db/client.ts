import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as schema from './schema/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_DRIVER = process.env.DB_DRIVER ?? 'pglite';

type DbHandle = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: DbHandle | null = null;
let pgliteInstance: PGlite | null = null;

async function createDb(): Promise<{ db: DbHandle; driver: PGlite | null }> {
  if (DB_DRIVER === 'postgres') {
    // Production: connect to a managed PostgreSQL instance.
    const { drizzle: drizzlePg } = await import('drizzle-orm/node-postgres');
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const pgDb = drizzlePg(pool, { schema });
    return { db: pgDb as unknown as DbHandle, driver: null };
  }
  const dataDir = process.env.DB_DIR ?? path.resolve(__dirname, '../../../data');
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const pgliteDb = drizzle(client, { schema });
  return { db: pgliteDb, driver: client };
}

export async function getDb(): Promise<DbHandle> {
  if (!dbInstance) {
    const created = await createDb();
    dbInstance = created.db;
    pgliteInstance = created.driver;
    await runMigrations(dbInstance, pgliteInstance);
  }
  return dbInstance;
}

/**
 * Synchronous handle for code that runs after startup (index.ts awaits getDb()
 * before serving). Throws if the database has not been initialized yet.
 */
export const db: DbHandle = new Proxy({} as DbHandle, {
  get(_target, prop) {
    if (!dbInstance) throw new Error('Database not initialized — await getDb() first');
    const value = Reflect.get(dbInstance as unknown as object, prop);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(dbInstance) : value;
  },
});

async function runMigrations(db: DbHandle, driver: PGlite | null) {
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  if (!fs.existsSync(migrationsFolder)) return;
  try {
    await migrate(db as never, { migrationsFolder });
  } catch (err) {
    // First run on an existing pglite dir may already have tables; log and continue
    if (driver) {
      console.warn('[db] migration note:', (err as Error).message);
    } else {
      throw err;
    }
  }
}

export async function closeDb() {
  if (pgliteInstance) await pgliteInstance.close();
  dbInstance = null;
  pgliteInstance = null;
}

export { schema };
export type AppDatabase = DbHandle;
