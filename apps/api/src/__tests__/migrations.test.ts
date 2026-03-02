import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Logger } from '@nestjs/common'
import type { Pool, PoolClient } from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMigrations } from '../database/migrate'

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations')
const FILE_001 = '001_initial.sql'
const FILE_002 = '002_add_constraints.sql'
const INSERT_SQL = 'INSERT INTO migrations (name) VALUES ($1)'
const CHECK_SQL = 'SELECT 1 FROM migrations WHERE name = $1'
const ADVISORY_LOCK_SQL = 'SELECT pg_advisory_xact_lock($1)'
const ADVISORY_LOCK_KEY = 7_777_777
const ROLLBACK_SQL = 'ROLLBACK'

const readMigration = (filename: string): string =>
  readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8')

// ---------------------------------------------------------------------------
// SQL file content tests
// ---------------------------------------------------------------------------

describe('Migration 001 — initial schema', () => {
  const sql = readMigration(FILE_001)

  it('should create health_checks table with correct columns', () => {
    expect(sql).toContain('health_checks')
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/)
    expect(sql).toMatch(/id\s+SERIAL\s+PRIMARY\s+KEY/)
    expect(sql).toMatch(/checked_at\s+TIMESTAMPTZ\s+DEFAULT\s+now\(\)/)
    expect(sql).toMatch(/status\s+VARCHAR\(20\)\s+NOT\s+NULL/)
  })
})

describe('Migration 002 — add constraints', () => {
  const sql = readMigration(FILE_002)

  it('should add CHECK constraint and index with idempotent patterns', () => {
    expect(sql).toContain('health_checks')
    expect(sql).toContain("'connected'")
    expect(sql).toContain("'error'")
    expect(sql).toContain("'not configured'")
    expect(sql).toMatch(/CHECK\s*\(\s*status\s+IN\s*\(/)
    expect(sql).toContain('idx_health_checks_checked_at')
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/)
    expect(sql).toMatch(/DO\s+\$\$/)
  })
})

// ---------------------------------------------------------------------------
// runMigrations() unit tests — all fs/promises calls are mocked
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({ readdir: vi.fn(), readFile: vi.fn() }))
const fsMock = await import('fs/promises')
const readdirMock = vi.mocked(fsMock.readdir)
const readFileMock = vi.mocked(fsMock.readFile)

const SQL_001 = readMigration(FILE_001)
const SQL_002 = readMigration(FILE_002)

interface MockClient {
  client: PoolClient
  queryMock: ReturnType<typeof vi.fn>
  releaseMock: ReturnType<typeof vi.fn>
}

const buildMockClient = (appliedMigrations: string[] = []): MockClient => {
  const queryMock = vi.fn((sql: string, params?: unknown[]) => {
    if (sql === ADVISORY_LOCK_SQL || sql === INSERT_SQL) return { rows: [] }
    const trimmed = sql.trimStart()
    if (['BEGIN', 'COMMIT', ROLLBACK_SQL].some((k) => trimmed.startsWith(k))) return { rows: [] }
    if (trimmed.startsWith('CREATE TABLE IF NOT EXISTS migrations')) return { rows: [] }
    if (sql === CHECK_SQL) {
      const name = (params as string[])[0]
      return appliedMigrations.includes(name) ? { rows: [{ '?column?': 1 }] } : { rows: [] }
    }
    return { rows: [] }
  })
  const releaseMock = vi.fn()
  const client = { query: queryMock, release: releaseMock } as unknown as PoolClient
  return { client, queryMock, releaseMock }
}

const buildMockPool = (client: PoolClient): Pool =>
  ({ connect: vi.fn().mockResolvedValue(client), end: vi.fn() }) as unknown as Pool

const setupFsMocks = (): void => {
  readdirMock.mockResolvedValue([FILE_001, FILE_002] as never)
  readFileMock.mockImplementation(((filePath: string) => {
    if (filePath.endsWith(FILE_001)) return Promise.resolve(SQL_001)
    if (filePath.endsWith(FILE_002)) return Promise.resolve(SQL_002)
    return Promise.reject(new Error(`Unexpected file: ${filePath}`))
  }) as typeof fsMock.readFile)
}

const buildErrorClient = (rejectSql: string, error: Error, rollbackError?: Error): MockClient => {
  const queryMock = vi.fn((sql: string) => {
    if (sql === rejectSql) return Promise.reject(error)
    if (rollbackError && sql.trim() === ROLLBACK_SQL) return Promise.reject(rollbackError)
    return Promise.resolve({ rows: [] })
  })
  const releaseMock = vi.fn()
  return {
    client: { query: queryMock, release: releaseMock } as unknown as PoolClient,
    queryMock,
    releaseMock,
  }
}

describe('runMigrations() — transaction and lock', () => {
  beforeEach(setupFsMocks)
  afterEach(() => vi.restoreAllMocks())

  it('acquires advisory lock inside a transaction', async () => {
    const { client, queryMock } = buildMockClient()
    await runMigrations(buildMockPool(client))
    const queries = queryMock.mock.calls.map((c) => c[0] as string)
    expect(queries[0]).toBe('BEGIN')
    expect(queries[1]).toBe(ADVISORY_LOCK_SQL)
    expect(queryMock.mock.calls[1][1]).toEqual([ADVISORY_LOCK_KEY])
  })

  it('creates migrations table before processing files', async () => {
    const { client, queryMock } = buildMockClient()
    await runMigrations(buildMockPool(client))
    const queries = queryMock.mock.calls.map((c) => (c[0] as string).trim())
    expect(
      queries.findIndex((q) => q.startsWith('CREATE TABLE IF NOT EXISTS migrations')),
    ).toBeGreaterThan(-1)
  })

  it('commits and releases client on success', async () => {
    const { client, queryMock, releaseMock } = buildMockClient()
    await runMigrations(buildMockPool(client))
    expect(queryMock.mock.calls.map((c) => (c[0] as string).trim())).toContain('COMMIT')
    expect(releaseMock).toHaveBeenCalledOnce()
  })
})

describe('runMigrations() — migration application', () => {
  beforeEach(setupFsMocks)
  afterEach(() => vi.restoreAllMocks())

  it('applies both migrations and their SQL content', async () => {
    const { client, queryMock } = buildMockClient()
    await runMigrations(buildMockPool(client))
    const insertCalls = queryMock.mock.calls.filter((c) => c[0] === INSERT_SQL)
    expect(insertCalls).toHaveLength(2)
    expect(insertCalls[0][1]).toEqual([FILE_001])
    expect(insertCalls[1][1]).toEqual([FILE_002])
    const allSql = queryMock.mock.calls.map((c) => c[0] as string)
    expect(allSql).toContain(SQL_001)
    expect(allSql).toContain(SQL_002)
  })
})

describe('runMigrations() — idempotency', () => {
  beforeEach(setupFsMocks)
  afterEach(() => vi.restoreAllMocks())

  it('skips already-applied migrations', async () => {
    const { client, queryMock } = buildMockClient([FILE_001, FILE_002])
    await runMigrations(buildMockPool(client))
    expect(queryMock.mock.calls.filter((c) => c[0] === INSERT_SQL)).toHaveLength(0)
  })

  it('applies only new migrations', async () => {
    const { client, queryMock } = buildMockClient([FILE_001])
    await runMigrations(buildMockPool(client))
    const insertCalls = queryMock.mock.calls.filter((c) => c[0] === INSERT_SQL)
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0][1]).toEqual([FILE_002])
  })
})

describe('runMigrations() — file ordering', () => {
  afterEach(() => vi.restoreAllMocks())

  it('applies in lexicographic order and ignores non-SQL files', async () => {
    readdirMock.mockResolvedValue([FILE_002, 'README.md', '.gitkeep', FILE_001] as never)
    readFileMock.mockImplementation(((filePath: string) => {
      if (filePath.endsWith(FILE_001)) return Promise.resolve(SQL_001)
      if (filePath.endsWith(FILE_002)) return Promise.resolve(SQL_002)
      return Promise.reject(new Error(`Unexpected file: ${filePath}`))
    }) as typeof fsMock.readFile)

    const { client, queryMock } = buildMockClient()
    await runMigrations(buildMockPool(client))
    const insertCalls = queryMock.mock.calls.filter((c) => c[0] === INSERT_SQL)
    expect(insertCalls).toHaveLength(2)
    expect(insertCalls[0][1]).toEqual([FILE_001])
    expect(insertCalls[1][1]).toEqual([FILE_002])
  })
})

describe('runMigrations() — error handling', () => {
  afterEach(() => vi.restoreAllMocks())

  it('rolls back and rethrows when migration SQL fails', async () => {
    readdirMock.mockResolvedValue([FILE_001] as never)
    readFileMock.mockResolvedValue(SQL_001 as never)
    const { client, queryMock } = buildErrorClient(SQL_001, new Error('syntax error'))
    await expect(runMigrations(buildMockPool(client))).rejects.toThrow('syntax error')
    expect(queryMock.mock.calls.map((c) => (c[0] as string).trim())).toContain(ROLLBACK_SQL)
  })

  it('releases client even when migration fails', async () => {
    readdirMock.mockResolvedValue([FILE_001] as never)
    readFileMock.mockResolvedValue(SQL_001 as never)
    const { client, releaseMock } = buildErrorClient(SQL_001, new Error('query failed'))
    await expect(runMigrations(buildMockPool(client))).rejects.toThrow()
    expect(releaseMock).toHaveBeenCalledOnce()
  })

  it('logs warning when ROLLBACK also fails', async () => {
    readdirMock.mockResolvedValue([FILE_001] as never)
    readFileMock.mockResolvedValue(SQL_001 as never)
    const rollbackErr = new Error('connection lost')
    const { client } = buildErrorClient(SQL_001, new Error('migration failed'), rollbackErr)
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    await expect(runMigrations(buildMockPool(client))).rejects.toThrow('migration failed')
    expect(warnSpy).toHaveBeenCalledWith(
      ROLLBACK_SQL + ' failed',
      expect.stringContaining('connection lost'),
    )
  })

  it('propagates pool.connect() failure', async () => {
    readdirMock.mockResolvedValue([FILE_001] as never)
    const pool = {
      connect: vi.fn().mockRejectedValue(new Error('cannot connect')),
      end: vi.fn(),
    } as unknown as Pool
    await expect(runMigrations(pool)).rejects.toThrow('cannot connect')
  })
})
