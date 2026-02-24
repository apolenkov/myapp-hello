import type { INestApplication } from '@nestjs/common'
import { VersioningType } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import { getOptionsToken } from '@nestjs/throttler'
import helmet from 'helmet'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AppModule } from '../app.module'
import { UnauthorizedExceptionFilter } from '../auth/unauthorized-exception.filter'
import { createBaseTestApp } from './test-utils'

const ctx = {} as { app: INestApplication }

beforeAll(async () => {
  ctx.app = await createBaseTestApp()
  ctx.app.use(helmet())
  ctx.app.useGlobalFilters(new UnauthorizedExceptionFilter())

  const config = new DocumentBuilder()
    .setTitle('myapp-hello API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(ctx.app, config)
  SwaggerModule.setup('docs', ctx.app, document)
  ctx.app
    .getHttpAdapter()
    .get('/openapi.json', (_req: unknown, res: { json: (body: unknown) => void }) => {
      res.json(document)
    })

  await ctx.app.init()
})

afterAll(async () => {
  await ctx.app.close()
})

describe('GET /health', () => {
  it('should return status ok without leaking env details', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health').expect(200)

    expect(res.body).toEqual({ status: 'ok' })
    expect(res.body).not.toHaveProperty('env')
    expect(res.body).not.toHaveProperty('app')
  })
})

describe('GET /v1', () => {
  it('should return hello world with db not configured (no DATABASE_URL)', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1').expect(200)

    expect(res.body).toMatchObject({
      message: 'Hello World!',
      db: 'not configured',
    })
    expect(res.body).toHaveProperty('env')
    expect(res.body).toHaveProperty('app')
    expect(res.body).toHaveProperty('timestamp')
  })

  it('should return valid ISO timestamp', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1').expect(200)
    const body = res.body as { timestamp: string }
    const parsed = new Date(body.timestamp)

    expect(parsed.toISOString()).toBe(body.timestamp)
  })
})

describe('GET /openapi.json', () => {
  it('should return valid OpenAPI 3.0 spec', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/openapi.json').expect(200)

    expect(res.body).toHaveProperty('openapi')
    expect(res.body).toHaveProperty('info.title', 'myapp-hello API')
    expect(res.body).toHaveProperty('paths')
  })
})

describe('GET /docs', () => {
  it('should serve Swagger UI HTML page', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/docs/')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.text).toContain('swagger-ui')
  })
})

describe('Unknown route', () => {
  it('should return 404 for non-existent path', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/non-existent-path')

    expect(res.status).toBe(404)
  })
})

describe('Rate limiter headers', () => {
  it('should include standard rate limit headers', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1').expect(200)

    expect(res.headers).toHaveProperty('x-ratelimit-limit')
    expect(res.headers).toHaveProperty('x-ratelimit-remaining')
    expect(res.headers).toHaveProperty('x-ratelimit-reset')
  })

  it('should return x-ratelimit-reset as a unix timestamp in seconds', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1').expect(200)
    const reset = Number(res.headers['x-ratelimit-reset'])

    expect(Number.isFinite(reset)).toBe(true)
    expect(reset).toBeGreaterThan(0)
  })
})

describe('Rate limit exceeded', () => {
  const rateLimitCtx = {} as { app: INestApplication }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getOptionsToken())
      .useValue([{ ttl: 60_000, limit: 2 }])
      .compile()

    rateLimitCtx.app = moduleRef.createNestApplication()
    rateLimitCtx.app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
    rateLimitCtx.app.useGlobalFilters(new UnauthorizedExceptionFilter())
    await rateLimitCtx.app.init()
  })

  afterAll(async () => {
    await rateLimitCtx.app.close()
  })

  it('should return 429 when rate limit is exceeded', async () => {
    const server = rateLimitCtx.app.getHttpServer()

    await request(server).get('/v1').expect(200)
    await request(server).get('/v1').expect(200)
    const res = await request(server).get('/v1')

    expect(res.status).toBe(429)
  })
})

describe('Security headers (Helmet)', () => {
  it('should not expose x-powered-by header', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health').expect(200)

    expect(res.headers).not.toHaveProperty('x-powered-by')
  })

  it('should include security headers from Helmet', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health').expect(200)

    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff')
    expect(res.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN')
  })
})
