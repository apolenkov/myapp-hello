import type { Pool } from 'pg'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DatabaseService } from '../database/database.service'
import { createSingleValueConfigService } from './helpers/mocks'

const TEST_DB_URL = 'postgresql://localhost/test'
const DB_QUERY_FAILED = 'Database health check failed'

const CONN_REFUSED = 'connection refused'

/** Access the private pool for test spying. */
function getPool(service: DatabaseService): Pool {
  const pool = (service as unknown as { pool: Pool | null }).pool
  if (!pool) throw new Error('Expected pool to be defined')
  return pool
}

async function createDbService(dbUrl?: string): Promise<DatabaseService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      DatabaseService,
      {
        provide: ConfigService,
        useValue: createSingleValueConfigService(dbUrl),
      },
    ],
  }).compile()
  return moduleRef.get(DatabaseService)
}

describe('DatabaseService — no database', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should report not configured when DATABASE_URL is not set', async () => {
    const service = await createDbService()

    expect(service.isConfigured).toBe(false)
    expect(await service.ping()).toBe('not configured')
  })

  it('should throw on query when database is not configured', async () => {
    const service = await createDbService()

    await expect(service.query('SELECT 1')).rejects.toThrow('Database is not configured')
  })

  it('should skip pool.end when pool is null', async () => {
    const service = await createDbService()

    // Should not throw
    await service.onModuleDestroy()
  })
})

describe('DatabaseService — with database', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should report configured when DATABASE_URL is set', async () => {
    const service = await createDbService(TEST_DB_URL)

    expect(service.isConfigured).toBe(true)
  })

  it('should return "connected" when pool.query succeeds', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)

    vi.spyOn(pool, 'query').mockResolvedValue(undefined as never)

    expect(await service.ping()).toBe('connected')
  })

  it('should return "error" when pool.query fails', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)

    vi.spyOn(pool, 'query').mockRejectedValue(new Error(CONN_REFUSED))

    expect(await service.ping()).toBe('error')
  })

  it('should log error stack when pool.query throws an Error', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)

    vi.spyOn(pool, 'query').mockRejectedValue(new Error(CONN_REFUSED))
    const logSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    await service.ping()

    expect(logSpy).toHaveBeenCalledWith(DB_QUERY_FAILED, expect.stringContaining(CONN_REFUSED))
  })

  it('should log stringified error when pool.query throws a non-Error', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)

    vi.spyOn(pool, 'query').mockRejectedValue('raw string error')
    const logSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    await service.ping()

    expect(logSpy).toHaveBeenCalledWith(DB_QUERY_FAILED, 'raw string error')
  })

  it('should delegate query to pool', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)
    const mockResult = { rows: [{ id: 1 }], command: 'SELECT', rowCount: 1 }

    vi.spyOn(pool, 'query').mockResolvedValue(mockResult as never)

    const result = await service.query('SELECT $1::int AS id', [1])

    expect(result).toBe(mockResult)
    expect(pool.query).toHaveBeenCalledWith('SELECT $1::int AS id', [1])
  })

  it('should close pool on module destroy', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)
    const endSpy = vi.spyOn(pool, 'end').mockResolvedValue()

    await service.onModuleDestroy()

    expect(endSpy).toHaveBeenCalledOnce()
  })

  it('should resolve when pool.end() times out after 10s', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    const pendingPromise = new Promise<void>(() => undefined)
    vi.spyOn(pool, 'end').mockReturnValue(pendingPromise)

    vi.useFakeTimers()
    const destroyPromise = service.onModuleDestroy()
    await vi.advanceTimersByTimeAsync(10_000)
    await destroyPromise
    vi.useRealTimers()

    expect(warnSpy).toHaveBeenCalledWith('Pool shutdown timed out after 10s, forcing close')
  })
})
