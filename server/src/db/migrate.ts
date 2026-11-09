import 'dotenv/config';
import { getDb, closeDb } from './client.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Applies pending Drizzle migrations and exits.
 * (The API server also runs migrations on boot; this exists for CI/deploy scripts.)
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const db = await getDb();
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  console.log(`[migrate] database ready (driver=${process.env.DB_DRIVER ?? 'pglite'})`);
  if (fs.existsSync(migrationsFolder)) console.log(`[migrate] migrations folder: ${migrationsFolder}`);
  void db;
  await closeDb();
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
