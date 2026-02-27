import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'

import { IS_PUBLIC_KEY } from './public.decorator'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<Request>()
    const authHeader = request.headers.authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined

    if (!token) {
      throw new UnauthorizedException('Unauthorized')
    }

    const secret = this.config.get<string>('JWT_SECRET')
    if (!secret) {
      throw new UnauthorizedException('Unauthorized')
    }

    try {
      const payload = this.jwt.verify<Record<string, unknown>>(token, {
        secret,
        algorithms: ['HS256'],
      })
      ;(request as unknown as Record<string, unknown>)['user'] = payload
      return true
    } catch {
      throw new UnauthorizedException('Invalid token')
    }
  }
}
