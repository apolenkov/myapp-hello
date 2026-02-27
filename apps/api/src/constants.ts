/**
 * Paths excluded from metrics recording and OTel trace instrumentation.
 * Shared between instrumentation.ts and metrics.interceptor.ts to keep
 * the ignore list in one place.
 */
export const IGNORED_PATHS = new Set(['/health', '/metrics'])
