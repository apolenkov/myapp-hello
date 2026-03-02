import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

import type { JwtPayload, RequestWithUser } from './request-with-user'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>()
    return request.user
  },
)
