import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

import type { Pool } from 'pg'

const ADVISORY_LOCK_KEY = 7_777_777

/**
 * Run SQL migrations in order, with advisory lock to prevent concurrent runs.
 * Safe to call on every startup — skips already-applied migrations.
 * @param pool - PostgreSQL connection pool
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect()
  try {
    // Acquire advisory lock — only ONE replica runs migrations at a time
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])

    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT now()
      )
    `)

    const migrationsDir = join(__dirname, '../../migrations')
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

    for (const file of files) {
      const { rows } = await client.query('SELECT 1 FROM migrations WHERE name = $1', [file])
      if (rows.length > 0) continue

      const sql = await readFile(join(migrationsDir, file), 'utf-8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`Applied migration: ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
    client.release()
  }
}
