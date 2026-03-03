import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { AppModule } from '../app.module'
import { JWT_AUDIENCE, JWT_ISSUER } from '../auth/jwt.constants'
import { UnauthorizedExceptionFilter } from '../auth/unauthorized-exception.filter'
import { DB_STATUS_CONNECTED } from '../database/database.constants'
import { DatabaseService } from '../database/database.service'
import { TEST_JWT_SECRET, testConfigService } from './helpers/test-utils'

const REGISTER_URL = '/v1/auth/register'
const LOGIN_URL = '/v1/auth/login'
const ITEMS_URL = '/v1/items'
const VALID_PASSWORD = 'SecurePass123!'
const LOGIN_USER = `login-test-${String(Date.now())}`

interface StoredUser {
  id: string
  username: string
  password_hash: string
  created_at: Date
}

/** In-memory mock for DatabaseService.query that simulates a users table. */
function createUsersMockQuery(): ReturnType<typeof vi.fn> {
  const users: StoredUser[] = []

  return vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT INTO users')) {
      const username = params?.[0] as string
      const existing = users.find((u) => u.username === username)
      if (existing) {
        throw new Error('duplicate key value violates unique constraint')
      }
      const user: StoredUser = {
        id: randomUUID(),
        username,
        password_hash: params?.[1] as string,
        created_at: new Date(),
      }
      users.push(user)
      return { rows: [{ id: user.id, username: user.username }], rowCount: 1 }
    }

    if (sql.includes('SELECT') && sql.includes('FROM users')) {
      const username = params?.[0] as string
      const user = users.find((u) => u.username === username)
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 }
    }

    // Default: items queries return empty (not the focus of this test)
    return { rows: [], rowCount: 0 }
  })
}

const ctx = {} as { app: INestApplication }

beforeAll(async () => {
  const mockQuery = createUsersMockQuery()

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue(testConfigService)
    .overrideProvider(DatabaseService)
    .useValue({
      ping: vi.fn().mockResolvedValue(DB_STATUS_CONNECTED),
      isConfigured: true,
      rawPool: null,
      query: mockQuery,
      onModuleDestroy: vi.fn(),
    })
    .compile()

  ctx.app = moduleRef.createNestApplication()
  ctx.app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  ctx.app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  ctx.app.useGlobalFilters(new UnauthorizedExceptionFilter())
  await ctx.app.init()

  // Pre-register user for login tests
  await request(ctx.app.getHttpServer())
    .post(REGISTER_URL)
    .send({ username: LOGIN_USER, password: VALID_PASSWORD })
})

afterAll(async () => {
  await ctx.app.close()
})

describe('POST /v1/auth/register', () => {
  it('should register a new user and return access token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(REGISTER_URL)
      .send({ username: 'testuser', password: VALID_PASSWORD })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('accessToken')
    expect(typeof res.body.accessToken).toBe('string')
  })

  it('should return 400 for missing username', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(REGISTER_URL)
      .send({ password: VALID_PASSWORD })

    expect(res.status).toBe(400)
  })

  it('should return 400 for missing password', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(REGISTER_URL)
      .send({ username: 'testuser2' })

    expect(res.status).toBe(400)
  })

  it('should return 400 for short password (< 8 chars)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(REGISTER_URL)
      .send({ username: 'testuser3', password: 'short' })

    expect(res.status).toBe(400)
  })

  it('should return 409 for duplicate username', async () => {
    const uniqueName = `dup-user-${String(Date.now())}`
    await request(ctx.app.getHttpServer())
      .post(REGISTER_URL)
      .send({ username: uniqueName, password: VALID_PASSWORD })

    const res = await request(ctx.app.getHttpServer())
      .post(REGISTER_URL)
      .send({ username: uniqueName, password: 'DifferentPass456!' })

    expect(res.status).toBe(409)
  })
})

describe('POST /v1/auth/login', () => {
  it('should login with correct credentials and return access token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(LOGIN_URL)
      .send({ username: LOGIN_USER, password: VALID_PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
    expect(typeof res.body.accessToken).toBe('string')
  })

  it('should return token with correct claims (sub, iss, aud)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(LOGIN_URL)
      .send({ username: LOGIN_USER, password: VALID_PASSWORD })

    const jwtService = new JwtService({})
    const payload = jwtService.verify<{ sub: string; iss: string; aud: string }>(
      res.body.accessToken as string,
      { secret: TEST_JWT_SECRET },
    )

    expect(payload.sub).toBeDefined()
    expect(payload.iss).toBe(JWT_ISSUER)
    expect(payload.aud).toBe(JWT_AUDIENCE)
  })

  it('should return token that grants access to protected routes', async () => {
    const loginRes = await request(ctx.app.getHttpServer())
      .post(LOGIN_URL)
      .send({ username: LOGIN_USER, password: VALID_PASSWORD })

    const res = await request(ctx.app.getHttpServer())
      .get(ITEMS_URL)
      .set('Authorization', `Bearer ${loginRes.body.accessToken as string}`)

    expect(res.status).toBe(200)
  })

  it('should return 401 for wrong password', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(LOGIN_URL)
      .send({ username: LOGIN_USER, password: 'WrongPassword!' })

    expect(res.status).toBe(401)
  })

  it('should return 401 for non-existent user', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(LOGIN_URL)
      .send({ username: 'nonexistent', password: 'SomePass123!' })

    expect(res.status).toBe(401)
  })

  it('should return 400 for missing credentials', async () => {
    const res = await request(ctx.app.getHttpServer()).post(LOGIN_URL).send({})

    expect(res.status).toBe(400)
  })
})
