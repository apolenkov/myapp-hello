function validateFormats(config: Record<string, unknown>): string[] {
  const errors: string[] = []

  const jwtSecret = config['JWT_SECRET']
  if (jwtSecret && typeof jwtSecret === 'string' && jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters')
  }

  const databaseUrl = config['DATABASE_URL']
  if (databaseUrl && typeof databaseUrl === 'string') {
    if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
      errors.push('DATABASE_URL must start with postgres:// or postgresql://')
    }
  }

  const port = config['PORT']
  if (port !== undefined) {
    const portNum = Number(port)
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      errors.push('PORT must be a valid port number (1-65535)')
    }
  }

  const throttleTtl = config['THROTTLE_TTL']
  if (throttleTtl !== undefined) {
    const ttlNum = Number(throttleTtl)
    if (!Number.isInteger(ttlNum) || ttlNum < 1) {
      errors.push('THROTTLE_TTL must be a positive integer')
    }
  }

  const throttleLimit = config['THROTTLE_LIMIT']
  if (throttleLimit !== undefined) {
    const limitNum = Number(throttleLimit)
    if (!Number.isInteger(limitNum) || limitNum < 1) {
      errors.push('THROTTLE_LIMIT must be a positive integer')
    }
  }

  return errors
}

/**
 * Validates environment variables at application startup.
 * Throws if required vars are missing in production or formats are invalid.
 */
export function validate(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = []
  const nodeEnv = typeof config['NODE_ENV'] === 'string' ? config['NODE_ENV'] : 'development'
  const isProduction = nodeEnv === 'production'

  if (isProduction && !config['JWT_SECRET']) {
    errors.push('JWT_SECRET is required in production')
  }

  if (isProduction && !config['DATABASE_URL']) {
    errors.push('DATABASE_URL is required in production')
  }

  errors.push(...validateFormats(config))

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n  - ${errors.join('\n  - ')}`)
  }

  return {
    ...config,
    THROTTLE_TTL: Number(config['THROTTLE_TTL'] ?? 60_000),
    THROTTLE_LIMIT: Number(config['THROTTLE_LIMIT'] ?? 100),
  }
}
