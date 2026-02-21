import request from 'supertest'
import { describe, it, expect } from 'vitest'

import { app } from '../server'

describe('GET /metrics', () => {
  it('should return 200 with Prometheus text format', async () => {
    const res = await request(app).get('/metrics').expect(200)

    expect(res.headers['content-type']).toContain('text/plain')
  })

  it('should include OTel resource and auto-instrumentation metrics', async () => {
    await request(app).get('/').expect(200)

    const res = await request(app).get('/metrics').expect(200)
    const body = res.text

    expect(body).toContain('target_info')
    expect(body).toContain('http_server_duration')
  })

  it('should include custom HTTP request metrics after a request', async () => {
    // Hit a non-excluded route so custom metrics are recorded
    await request(app).get('/').expect(200)

    const res = await request(app).get('/metrics').expect(200)
    const body = res.text

    expect(body).toContain('http_request_duration')
    expect(body).toContain('http_requests_total')
  })

  it('should not record /metrics and /health in custom HTTP metrics', async () => {
    // Hit /metrics and /health multiple times
    await request(app).get('/metrics')
    await request(app).get('/health')

    const res = await request(app).get('/metrics').expect(200)
    const body = res.text

    // /metrics and /health should be excluded from custom route labels
    const routeLines = body
      .split('\n')
      .filter((line) => line.includes('http_request_duration') && line.includes('route='))

    const hasMetricsRoute = routeLines.some((line) => line.includes('route="/metrics"'))
    const hasHealthRoute = routeLines.some((line) => line.includes('route="/health"'))

    expect(hasMetricsRoute).toBe(false)
    expect(hasHealthRoute).toBe(false)
  })
})
