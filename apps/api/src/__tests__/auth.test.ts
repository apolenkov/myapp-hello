import type { INestApplication } from '@nestjs/common'
import { Controller, Get, Module, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AppModule } from '../app.module'
import { UnauthorizedExceptionFilter } from '../auth/unauthorized-exception.filter'

const TEST_SECRET = 'test-secret-for-unit-tests'
const PROTECTED_ROUTE = '/v1/protected-test'

@Controller('protected-test')
class ProtectedTestController {
  @Get()
  getProtected(): { ok: boolean } {
    return { ok: true }
  }
}

@Module({ controllers: [ProtectedTestController] })
class ProtectedTestModule {}

const ctx = {} as { app: INestApplication }

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ProtectedTestModule],
  })
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string) => {
        const config: Record<string, string> = {
          JWT_SECRET: TEST_SECRET,
          NODE_ENV: 'test',
          APP_NAME: 'myapp-hello',
        }
        return config[key]
      },
    })
    .compile()

  ctx.app = moduleRef.createNestApplication()
  ctx.app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  ctx.app.useGlobalFilters(new UnauthorizedExceptionFilter())
  await ctx.app.init()
})

afterAll(async () => {
  await ctx.app.close()
})

describe('Auth Guard', () => {
  it('should return 401 when no Authorization header on protected route', async () => {
    const res = await request(ctx.app.getHttpServer()).get(PROTECTED_ROUTE)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('should return 401 for invalid token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(PROTECTED_ROUTE)
      .set('Authorization', 'Bearer invalid.token.here')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid token' })
  })

  it('should allow access to @Public() routes without token', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('should allow access to @Public() routes with valid token', async () => {
    const jwtService = new JwtService({})
    const token = jwtService.sign({ sub: 'user-123', role: 'admin' }, { secret: TEST_SECRET })

    const res = await request(ctx.app.getHttpServer())
      .get('/health')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })

  it('should return 401 for non-Bearer Authorization header', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(PROTECTED_ROUTE)
      .set('Authorization', 'Basic some-credentials')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('should return 200 for valid token on protected route', async () => {
    const jwtService = new JwtService({})
    const token = jwtService.sign({ sub: 'user-123', role: 'admin' }, { secret: TEST_SECRET })

    const res = await request(ctx.app.getHttpServer())
      .get(PROTECTED_ROUTE)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

describe('Auth Guard — missing JWT_SECRET', () => {
  const noSecretCtx = {} as { app: INestApplication }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProtectedTestModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          const config: Record<string, string> = {
            NODE_ENV: 'test',
            APP_NAME: 'myapp-hello',
          }
          return config[key]
        },
      })
      .compile()

    noSecretCtx.app = moduleRef.createNestApplication()
    noSecretCtx.app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
    noSecretCtx.app.useGlobalFilters(new UnauthorizedExceptionFilter())
    await noSecretCtx.app.init()
  })

  afterAll(async () => {
    await noSecretCtx.app.close()
  })

  it('should return Unauthorized (not Invalid token) when JWT_SECRET is missing', async () => {
    const jwtService = new JwtService({})
    const token = jwtService.sign({ sub: 'user-123' }, { secret: 'any-secret' })

    const res = await request(noSecretCtx.app.getHttpServer())
      .get(PROTECTED_ROUTE)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })
})
