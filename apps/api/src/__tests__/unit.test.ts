import { UnauthorizedException } from '@nestjs/common'
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Reflector } from '@nestjs/core'
import type { JwtService } from '@nestjs/jwt'
import { firstValueFrom, of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'

import { AppService } from '../app.service'
import { JwtAuthGuard } from '../auth/auth.guard'
import type { DatabaseService } from '../database/database.service'
import { MetricsInterceptor } from '../metrics/metrics.interceptor'

describe('JwtAuthGuard — missing JWT_SECRET at runtime', () => {
  it('throws UnauthorizedException when JWT_SECRET config is missing', () => {
    const mockConfig = { get: vi.fn().mockReturnValue(undefined) } as unknown as ConfigService
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector
    const guard = new JwtAuthGuard({} as JwtService, mockConfig, mockReflector)
    const mockCtx = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          headers: { authorization: 'Bearer some.valid.token' },
        }),
      }),
    } as unknown as ExecutionContext

    expect(() => guard.canActivate(mockCtx)).toThrow(UnauthorizedException)
  })
})

describe('MetricsInterceptor — route fallback to req.path', () => {
  it('uses req.path as route when req.route is undefined', async () => {
    const interceptor = new MetricsInterceptor()
    const mockCtx = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          route: undefined,
          path: '/some-unknown-path',
          method: 'GET',
        }),
        getResponse: vi.fn().mockReturnValue({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext
    const mockHandler = { handle: vi.fn().mockReturnValue(of(undefined)) } as CallHandler

    await firstValueFrom(interceptor.intercept(mockCtx, mockHandler))
  })
})

describe('AppService — config fallback values', () => {
  it('uses fallback env and app name when config returns undefined', async () => {
    const mockDb = {
      getStatus: vi.fn().mockResolvedValue('ok'),
    } as unknown as DatabaseService
    const mockConfig = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService
    const service = new AppService(mockDb, mockConfig)

    const result = await service.getHello()

    expect(result.env).toBe('development')
    expect(result.app).toBe('myapp-hello')
  })
})
