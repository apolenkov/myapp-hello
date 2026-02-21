import type { Pool } from 'pg'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DatabaseService } from '../database/database.service'

const TEST_DB_URL = 'postgresql://localhost/test'

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

    vi.spyOn(pool, 'query').mockRejectedValue(new Error('connection refused'))

    expect(await service.getStatus()).toBe('error')
  })

  it('should close pool on module destroy', async () => {
    const service = await createDbService(TEST_DB_URL)
    const pool = getPool(service)
    const endSpy = vi.spyOn(pool, 'end').mockResolvedValue()

    await service.onModuleDestroy()

    expect(endSpy).toHaveBeenCalledOnce()
  })
})
