/**
 * Express middleware that records HTTP request duration and count.
 * Excludes /metrics and /health to avoid self-scrape noise.
 */
import type { NextFunction, Request, Response } from 'express'

import { httpRequestDuration, httpRequestsTotal } from '../metrics'

const EXCLUDED_PATHS = new Set(['/metrics', '/health'])

/** Records HTTP request duration and increments request counter. */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now()

  res.on('finish', () => {
    const route = (req.route as { path?: string } | undefined)?.path ?? req.path
    if (EXCLUDED_PATHS.has(route)) return

    const durationS = (performance.now() - start) / 1000
    const attrs = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    }

    httpRequestDuration.record(durationS, attrs)
    httpRequestsTotal.add(1, attrs)
  })

  next()
}
