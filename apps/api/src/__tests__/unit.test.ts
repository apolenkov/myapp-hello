import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common'
import type { ArgumentsHost, CallHandler, ExecutionContext } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { AbstractHttpAdapter, Reflector } from '@nestjs/core'
import type { JwtService } from '@nestjs/jwt'
import { SentryGlobalFilter } from '@sentry/nestjs/setup'
import { firstValueFrom, of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'

import { AppService } from '../app.service'
import { JwtAuthGuard } from '../auth/auth.guard'
import { MetricsInterceptor } from '../metrics/metrics.interceptor'
import * as metricsModule from '../metrics/instruments'
import { createMockDatabaseService, createUndefinedConfigService } from './helpers/mocks'

describe('JwtAuthGuard — missing JWT_SECRET at runtime', () => {
  it('throws UnauthorizedException when JWT_SECRET config is missing', () => {
    const mockConfig = createUndefinedConfigService()
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

describe('JwtAuthGuard — non-JWT errors propagate instead of being swallowed', () => {
  it('re-throws unexpected errors from jwt.verify rather than returning 401', () => {
    const unexpectedError = new Error('Database connection failed')
    const mockJwtService = {
      verify: vi.fn().mockImplementation(() => {
        throw unexpectedError
      }),
    } as unknown as JwtService
    const mockConfig = {
      get: vi.fn().mockReturnValue('some-secret'),
    } as unknown as ConfigService
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector
    const guard = new JwtAuthGuard(mockJwtService, mockConfig, mockReflector)
    const mockCtx = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          headers: { authorization: 'Bearer some.valid.token' },
        }),
      }),
    } as unknown as ExecutionContext

    // Non-JWT errors must propagate, not be silently converted to UnauthorizedException
    expect(() => guard.canActivate(mockCtx)).toThrow('Database connection failed')
    expect(() => guard.canActivate(mockCtx)).not.toThrow(UnauthorizedException)
  })
})

const TEST_ROUTE = '/some-unknown-path'

describe('MetricsInterceptor — route fallback to req.path', () => {
  it('uses req.path as route when req.route is undefined and records metrics', async () => {
    const recordSpy = vi
      .spyOn(metricsModule.httpRequestDuration, 'record')
      .mockImplementation(() => undefined)
    const addSpy = vi
      .spyOn(metricsModule.httpRequestsTotal, 'add')
      .mockImplementation(() => undefined)

    const interceptor = new MetricsInterceptor()
    const mockCtx = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          route: undefined,
          path: TEST_ROUTE,
          method: 'GET',
        }),
        getResponse: vi.fn().mockReturnValue({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext
    const mockHandler = { handle: vi.fn().mockReturnValue(of(undefined)) } as CallHandler

    await firstValueFrom(interceptor.intercept(mockCtx, mockHandler))

    expect(recordSpy).toHaveBeenCalledOnce()

    const [duration, attrs] = recordSpy.mock.calls[0] as [number, Record<string, string>]
    expect(typeof duration).toBe('number')
    expect(duration).toBeGreaterThanOrEqual(0)
    expect(attrs).toEqual({
      method: 'GET',
      route: TEST_ROUTE,
      status_code: '200',
    })

    expect(addSpy).toHaveBeenCalledOnce()
    expect(addSpy).toHaveBeenCalledWith(1, {
      method: 'GET',
      route: TEST_ROUTE,
      status_code: '200',
    })

    recordSpy.mockRestore()
    addSpy.mockRestore()
  })

  it('skips metrics for excluded paths', async () => {
    const recordSpy = vi
      .spyOn(metricsModule.httpRequestDuration, 'record')
      .mockImplementation(() => undefined)
    const addSpy = vi
      .spyOn(metricsModule.httpRequestsTotal, 'add')
      .mockImplementation(() => undefined)

    const interceptor = new MetricsInterceptor()
    const mockCtx = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          route: undefined,
          path: '/health',
          method: 'GET',
        }),
        getResponse: vi.fn().mockReturnValue({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext
    const mockHandler = { handle: vi.fn().mockReturnValue(of('ok')) } as CallHandler

    const result = await firstValueFrom(interceptor.intercept(mockCtx, mockHandler))

    expect(result).toBe('ok')
    expect(recordSpy).not.toHaveBeenCalled()
    expect(addSpy).not.toHaveBeenCalled()

    recordSpy.mockRestore()
    addSpy.mockRestore()
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

describe('AppService — getHello() returns defaults when env vars are undefined', () => {
  it('uses fallback env and app name when config returns undefined', async () => {
    const mockDb = createMockDatabaseService()
    const mockConfig = createUndefinedConfigService()
    const service = new AppService(mockDb, mockConfig)

    const result = await service.getHello()

    expect(result.env).toBe('development')
    expect(result.app).toBe('myapp-hello')
  })
})
