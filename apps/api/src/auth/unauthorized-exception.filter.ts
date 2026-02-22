import { ArgumentsHost, Catch, ExceptionFilter, UnauthorizedException } from '@nestjs/common'
import type { Response } from 'express'

@Catch(UnauthorizedException)
export class UnauthorizedExceptionFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const message = exception.message

    response.status(401).json({ error: message })
  }
}
