import { describe, expect, it } from 'vitest'

import { validate } from './env.validation'

describe('env validation', () => {
  describe('development/test mode', () => {
    it('should pass with no env vars', () => {
      const result = validate({})

      expect(result).toEqual({
        THROTTLE_TTL: 60000,
        THROTTLE_LIMIT: 100,
      })
    })

    it('should pass with partial env vars', () => {
      const config = { JWT_SECRET: 'a'.repeat(32) }
      const result = validate(config)

      expect(result).toEqual({
        ...config,
        THROTTLE_TTL: 60000,
        THROTTLE_LIMIT: 100,
      })
    })
  })

  describe('production mode', () => {
    it('should pass with all required vars', () => {
      const config = {
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        DATABASE_URL: 'postgres://user:pass@host/db',
      }
      const result = validate(config)

      expect(result).toEqual({
        ...config,
        THROTTLE_TTL: 60000,
        THROTTLE_LIMIT: 100,
      })
    })

    it('should fail when JWT_SECRET is missing', () => {
      expect(() =>
        validate({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgres://user:pass@host/db',
        }),
      ).toThrow('JWT_SECRET is required in production')
    })

    it('should fail when DATABASE_URL is missing', () => {
      expect(() =>
        validate({
          NODE_ENV: 'production',
          JWT_SECRET: 'a'.repeat(32),
        }),
      ).toThrow('DATABASE_URL is required in production')
    })
  })

  describe('format validation', () => {
    it('should fail when JWT_SECRET is shorter than 32 characters', () => {
      expect(() => validate({ JWT_SECRET: 'too-short' })).toThrow(
        'JWT_SECRET must be at least 32 characters',
      )
    })

    it('should accept JWT_SECRET of exactly 32 characters', () => {
      const result = validate({ JWT_SECRET: 'a'.repeat(32) })

      expect(result).toHaveProperty('JWT_SECRET')
    })

    it('should fail when DATABASE_URL has invalid prefix', () => {
      expect(() => validate({ DATABASE_URL: 'mysql://host/db' })).toThrow(
        'DATABASE_URL must start with postgres:// or postgresql://',
      )
    })

    it('should accept postgresql:// prefix', () => {
      const result = validate({ DATABASE_URL: 'postgresql://user:pass@host/db' })

      expect(result.DATABASE_URL).toBe('postgresql://user:pass@host/db')
    })

    it('should fail when PORT is not a valid number', () => {
      expect(() => validate({ PORT: 'abc' })).toThrow('PORT must be a valid port number (1-65535)')
    })

    it('should fail when PORT is out of range', () => {
      expect(() => validate({ PORT: '99999' })).toThrow(
        'PORT must be a valid port number (1-65535)',
      )
    })

    it('should accept valid PORT', () => {
      const result = validate({ PORT: '3001' })

      expect(result).toHaveProperty('PORT', '3001')
    })
  })

  describe('multiple errors', () => {
    it('should collect all validation errors', () => {
      expect(() =>
        validate({
          NODE_ENV: 'production',
          PORT: 'invalid',
        }),
      ).toThrow(/JWT_SECRET.*DATABASE_URL.*PORT/s)
    })
  })
})
