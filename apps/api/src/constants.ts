/**
 * Paths excluded from metrics recording and OTel trace instrumentation.
 * Shared between instrumentation.ts and metrics.interceptor.ts to keep
 * the ignore list in one place.
 */
export const IGNORED_PATHS = new Set(['/health', '/metrics'])

/** Node environment string literal type. */
export type NodeEnv = 'production' | 'development' | 'test'

/** Node environment constants for use in comparisons. */
export const NODE_ENV_PRODUCTION: NodeEnv = 'production'
export const NODE_ENV_DEVELOPMENT: NodeEnv = 'development'
export const NODE_ENV_TEST: NodeEnv = 'test'

/** Default values for optional env vars. */
export const DEFAULT_NODE_ENV: NodeEnv = 'development'
export const DEFAULT_APP_NAME = 'myapp-hello'
