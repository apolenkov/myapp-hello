import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createBaseTestApp } from './test-utils'

const ctx = {} as { app: INestApplication }

beforeAll(async () => {
  ctx.app = await createBaseTestApp()
  await ctx.app.init()
})

afterAll(async () => {
  await ctx.app.close()
})

describe('GET /metrics', () => {
  it('should return 200 with prometheus metrics', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/metrics')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
  })

  it('should include OTel target_info metric', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/metrics')

    expect(res.text).toContain('target_info')
  })

  it('should include custom http_request_duration metric after making a request', async () => {
    await request(ctx.app.getHttpServer()).get('/v1')
    const res = await request(ctx.app.getHttpServer()).get('/metrics')

    expect(res.text).toContain('http_request_duration')
  })

  it('should include custom http_requests_total counter', async () => {
    await request(ctx.app.getHttpServer()).get('/v1')
    const res = await request(ctx.app.getHttpServer()).get('/metrics')

    expect(res.text).toContain('http_requests')
  })
})
