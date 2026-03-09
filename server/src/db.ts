/**
 * PostgreSQL connection pool.
 *
 * Uses the pg library to connect directly to PostgreSQL.
 * All route handlers use pool.query() for automatic connection management.
 * The realtime module uses pool.connect() for a dedicated LISTEN connection.
 */

import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Log connection errors so they don't crash the process silently
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err)
})

/**
 * Convenience helper: run a single query and return the rows.
 * Automatically acquires and releases a connection from the pool.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows as T[]
}

/**
 * Convenience helper: run a query and return the first row, or null.
 */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}
