import type { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'

import { DB_STATUS_CONNECTED } from '../../database/database.constants'
import type { DatabaseService } from '../../database/database.service'

/**
 * Create a mock ConfigService that returns undefined for all keys.
 * Use for testing fallback/default behavior.
 */
export const createUndefinedConfigService = (): ConfigService =>
  ({
    get: vi.fn().mockReturnValue(undefined),
    getOrThrow: vi.fn().mockImplementation((key: string) => {
      throw new Error(`Config key "${key}" is not defined`)
    }),
  }) as unknown as ConfigService

/**
 * Create a mock ConfigService backed by a key-value map.
 * Returns the mapped value or undefined for unknown keys.
 */
export const createMapConfigService = (map: Record<string, string>): ConfigService =>
  ({
    get: <T = string>(key: string, defaultValue?: T): T | undefined =>
      (map[key] as T | undefined) ?? defaultValue,
    getOrThrow: vi.fn().mockImplementation((key: string) => {
      const value = map[key]
      if (value === undefined) throw new Error(`Config key "${key}" is not defined`)
      return value
    }),
  }) as unknown as ConfigService

/**
 * Create a mock ConfigService that returns a fixed value for all keys.
 * Useful for DatabaseService tests where only DATABASE_URL matters.
 */
export const createSingleValueConfigService = (value: string | undefined): ConfigService =>
  ({
    get: (): string | undefined => value,
    getOrThrow: vi.fn().mockReturnValue(value),
  }) as unknown as ConfigService

/**
 * Create a mock DatabaseService with a successful ping response.
 * Override ping behavior via vi.spyOn on the returned mock.
 */
export const createMockDatabaseService = (pingResult = DB_STATUS_CONNECTED): DatabaseService =>
  ({
    ping: vi.fn().mockResolvedValue(pingResult),
    isConfigured: true,
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
  }) as unknown as DatabaseService
