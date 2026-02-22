import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable, tap } from 'rxjs'

import { httpRequestDuration, httpRequestsTotal } from '../metrics'

const EXCLUDED_PATHS = new Set(['/metrics', '/health'])

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = performance.now()
    const http = context.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()
    const route = (req.route as { path: string } | undefined)?.path ?? req.path

    if (EXCLUDED_PATHS.has(route)) {
      return next.handle()
    }

    return next.handle().pipe(
      tap(() => {
        const durationS = (performance.now() - start) / 1000
        const attrs = {
          method: req.method,
          route,
          status_code: String(res.statusCode),
        }
        httpRequestDuration.record(durationS, attrs)
        httpRequestsTotal.add(1, attrs)
      }),
    )
  }
}
