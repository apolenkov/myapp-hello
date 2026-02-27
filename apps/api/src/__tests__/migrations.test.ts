import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations')

const readMigration = (filename: string): string =>
  readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8')

describe('Migration 002 — add constraints', () => {
  const sql = readMigration('002_add_constraints.sql')

  it('should reference the health_checks table', () => {
    expect(sql).toContain('health_checks')
  })

  it('should define CHECK constraint covering all 3 statuses', () => {
    expect(sql).toContain("'connected'")
    expect(sql).toContain("'error'")
    expect(sql).toContain("'not configured'")
    expect(sql).toMatch(/CHECK\s*\(\s*status\s+IN\s*\(/)
  })

  it('should create index idx_health_checks_checked_at', () => {
    expect(sql).toContain('idx_health_checks_checked_at')
    expect(sql).toMatch(/CREATE\s+INDEX/)
  })

  it('should use idempotent patterns', () => {
    // DO $$ ... END $$ block for constraint (IF NOT EXISTS check)
    expect(sql).toMatch(/DO\s+\$\$/)
    expect(sql).toContain('IF NOT EXISTS')
    // CREATE INDEX IF NOT EXISTS for index
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/)
  })
})
