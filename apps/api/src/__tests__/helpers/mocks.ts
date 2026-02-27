import type { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'

import type { DatabaseService } from '../../database/database.service'

/**
 * Create a mock ConfigService that returns undefined for all keys.
 * Use for testing fallback/default behavior.
 */
export const createUndefinedConfigService = (): ConfigService =>
  ({ get: vi.fn().mockReturnValue(undefined) }) as unknown as ConfigService

/**
 * Create a mock ConfigService that returns a fixed value for all keys.
 * Useful for DatabaseService tests where only DATABASE_URL matters.
 */
export const createSingleValueConfigService = (value: string | undefined): ConfigService =>
  ({ get: (): string | undefined => value }) as unknown as ConfigService

/**
 * Create a mock DatabaseService with a successful ping response.
 * Override ping behavior via vi.spyOn on the returned mock.
 */
export const createMockDatabaseService = (pingResult = 'ok'): DatabaseService =>
  ({
    ping: vi.fn().mockResolvedValue(pingResult),
  }) as unknown as DatabaseService
