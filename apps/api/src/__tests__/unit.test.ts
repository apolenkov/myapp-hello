import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common'
import type { ArgumentsHost, CallHandler, ExecutionContext } from '@nestjs/common'
import type { AbstractHttpAdapter } from '@nestjs/core'
import type { ConfigService } from '@nestjs/config'
import type { Reflector } from '@nestjs/core'
import type { JwtService } from '@nestjs/jwt'
import { SentryGlobalFilter } from '@sentry/nestjs/setup'
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

describe('SentryGlobalFilter — httpAdapter prevents applicationRef TypeError', () => {
  const makeHost = (): ArgumentsHost =>
    ({
      getType: vi.fn().mockReturnValue('http'),
      getArgByIndex: vi.fn().mockReturnValue({}),
    }) as unknown as ArgumentsHost

  it('calls isHeadersSent without throwing when httpAdapter is provided', () => {
    const isHeadersSent = vi.fn().mockReturnValue(false)
    const reply = vi.fn()
    const mockAdapter = { isHeadersSent, reply } as unknown as AbstractHttpAdapter
    const filter = new SentryGlobalFilter(mockAdapter)

    filter.catch(new HttpException('Test error', HttpStatus.BAD_REQUEST), makeHost())

    expect(isHeadersSent).toHaveBeenCalled()
  })

  it('throws TypeError when httpAdapter is not provided', () => {
    const filter = new SentryGlobalFilter()
    expect(() => {
      filter.catch(new HttpException('Test error', HttpStatus.BAD_REQUEST), makeHost())
    }).toThrow(TypeError)
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
