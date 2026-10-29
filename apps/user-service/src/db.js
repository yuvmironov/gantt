import pg from 'pg';

const { Pool } = pg;

export function createPool(env = process.env) {
  const connectionString = env.DATABASE_URL ?? env.DATABASE_URL_USER;
  if (!connectionString) {
    throw new Error('database_url_required');
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

export async function closePool(pool) {
  await pool.end();
}
