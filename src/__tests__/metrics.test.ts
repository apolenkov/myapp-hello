import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// instrumentation MUST be imported before AppModule so OTel SDK
// registers the PrometheusExporter before custom meters are created
import { prometheusExporter } from '../instrumentation'
import { AppModule } from '../app.module'

const ctx = {} as { app: INestApplication }

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  ctx.app = moduleRef.createNestApplication()

  const metricsHandler = prometheusExporter.getMetricsRequestHandler.bind(prometheusExporter)
  ctx.app.getHttpAdapter().get('/metrics', metricsHandler)

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
    await request(ctx.app.getHttpServer()).get('/')
    const res = await request(ctx.app.getHttpServer()).get('/metrics')

    expect(res.text).toContain('http_request_duration')
  })

  it('should include custom http_requests_total counter', async () => {
    await request(ctx.app.getHttpServer()).get('/')
    const res = await request(ctx.app.getHttpServer()).get('/metrics')

    expect(res.text).toContain('http_requests')
  })
})
