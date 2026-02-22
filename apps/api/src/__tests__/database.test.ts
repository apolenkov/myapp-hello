import type { Pool } from 'pg'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DatabaseService } from '../database/database.service'

const TEST_DB_URL = 'postgresql://localhost/test'
const DB_QUERY_FAILED = 'Database query failed'
const CONN_REFUSED = 'connection refused'

function getPool(service: DatabaseService): Pool {
  if (!service.pool) throw new Error('Expected pool to be defined')
  return service.pool
}

async function createDbService(dbUrl?: string): Promise<DatabaseService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      DatabaseService,
      {
        provide: ConfigService,
        useValue: { get: (): string | undefined => dbUrl },
      },
    ],
  }).compile()
  return moduleRef.get(DatabaseService)
}

describe('DatabaseService — no database', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return "not configured" when DATABASE_URL is not set', async () => {
    const service = await createDbService()

    expect(service.pool).toBeNull()
    expect(await service.getStatus()).toBe('not configured')
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

  it('should return "connected" when pool.query succeeds', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)

    vi.spyOn(pool, 'query').mockResolvedValue(undefined as never)

    expect(await service.getStatus()).toBe('connected')
  })

  it('should return "error" when pool.query fails', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)

    vi.spyOn(pool, 'query').mockRejectedValue(new Error(CONN_REFUSED))

    expect(await service.getStatus()).toBe('error')
  })

  it('should log error stack when pool.query throws an Error', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)

    vi.spyOn(pool, 'query').mockRejectedValue(new Error(CONN_REFUSED))
    const logSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    await service.getStatus()

    expect(logSpy).toHaveBeenCalledWith(DB_QUERY_FAILED, expect.stringContaining(CONN_REFUSED))
  })

  it('should log stringified error when pool.query throws a non-Error', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)

    vi.spyOn(pool, 'query').mockRejectedValue('raw string error')
    const logSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    await service.getStatus()

    expect(logSpy).toHaveBeenCalledWith(DB_QUERY_FAILED, 'raw string error')
  })

  it('should close pool on module destroy', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)
    const endSpy = vi.spyOn(pool, 'end').mockResolvedValue()

    await service.onModuleDestroy()

    expect(endSpy).toHaveBeenCalledOnce()
  })
})
