import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { finalize, Observable } from 'rxjs'

import { IGNORED_PATHS } from '../constants'
import { httpRequestDuration, httpRequestsTotal } from './instruments'

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = performance.now()
    const http = context.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()
    const route = (req.route as { path: string } | undefined)?.path ?? req.path

    if (IGNORED_PATHS.has(route)) {
      return next.handle()
    }

    return next.handle().pipe(
      finalize(() => {
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
