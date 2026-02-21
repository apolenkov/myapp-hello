import request from 'supertest'
import { describe, it, expect } from 'vitest'

import { app } from '../server'

describe('GET /health', () => {
  it('should return status ok without leaking env details', async () => {
    const res = await request(app).get('/health').expect(200)

    expect(res.body).toEqual({ status: 'ok' })
    expect(res.body).not.toHaveProperty('env')
    expect(res.body).not.toHaveProperty('app')
  })
})

describe('GET /', () => {
  it('should return hello world with db not configured (no DATABASE_URL)', async () => {
    const res = await request(app).get('/').expect(200)

    expect(res.body).toMatchObject({
      message: 'Hello World!',
      db: 'not configured',
    })
    expect(res.body).toHaveProperty('env')
    expect(res.body).toHaveProperty('app')
    expect(res.body).toHaveProperty('timestamp')
  })

  it('should return valid ISO timestamp', async () => {
    const res = await request(app).get('/').expect(200)
    const body = res.body as { timestamp: string }
    const parsed = new Date(body.timestamp)

    expect(parsed.toISOString()).toBe(body.timestamp)
  })
})

describe('GET /openapi.json', () => {
  it('should return valid OpenAPI 3.0 spec', async () => {
    const res = await request(app).get('/openapi.json').expect(200)

    expect(res.body).toHaveProperty('openapi', '3.0.0')
    expect(res.body).toHaveProperty('info.title', 'myapp-hello API')
    expect(res.body).toHaveProperty('paths')
  })
})

describe('Rate limiter headers', () => {
  it('should include standard rate limit headers', async () => {
    const res = await request(app).get('/health').expect(200)

    expect(res.headers).toHaveProperty('ratelimit-limit')
    expect(res.headers).toHaveProperty('ratelimit-remaining')
  })
})
