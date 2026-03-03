import type { INestApplication } from '@nestjs/common'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { AppModule } from '../app.module'
import { UnauthorizedExceptionFilter } from '../auth/unauthorized-exception.filter'
import { DB_STATUS_CONNECTED } from '../database/database.constants'
import { DatabaseService } from '../database/database.service'
import { createFullMockQuery } from './helpers/mock-db'
import { testConfigService } from './helpers/test-utils'

const REGISTER_URL = '/v1/auth/register'
const LOGIN_URL = '/v1/auth/login'
const ITEMS_URL = '/v1/items'
const E2E_ITEM_TITLE = 'E2E Test Item'

const ctx = {} as { app: INestApplication }

async function createE2eApp(): Promise<INestApplication> {
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
      query: createFullMockQuery(),
      onModuleDestroy: vi.fn(),
    })
    .compile()

  const app = moduleRef.createNestApplication()
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  app.useGlobalFilters(new UnauthorizedExceptionFilter())
  await app.init()
  return app
}

beforeAll(async () => {
  ctx.app = await createE2eApp()
})

afterAll(async () => {
  await ctx.app.close()
})

describe('E2E Flow: register → login → CRUD → verify', () => {
  const username = `e2e-user-${String(Date.now())}`
  const password = 'E2eTestPass123!'
  const state = {} as { token: string; itemId: string }

  it('step 1: register a new user', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(REGISTER_URL)
      .send({ username, password })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('accessToken')
  })

  it('step 2: login with registered credentials', async () => {
    const res = await request(ctx.app.getHttpServer()).post(LOGIN_URL).send({ username, password })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
    state.token = res.body.accessToken as string
  })

  it('step 3: create an item with auth token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(ITEMS_URL)
      .set('Authorization', `Bearer ${state.token}`)
      .send({ title: E2E_ITEM_TITLE, description: 'Created in flow test' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ title: E2E_ITEM_TITLE, status: 'active' })
    state.itemId = res.body.id as string
  })

  it('step 4: list items shows created item', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(ITEMS_URL)
      .set('Authorization', `Bearer ${state.token}`)

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({ title: E2E_ITEM_TITLE })
  })

  it('step 5: get item by id', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`${ITEMS_URL}/${state.itemId}`)
      .set('Authorization', `Bearer ${state.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: state.itemId, title: E2E_ITEM_TITLE })
  })

  it('step 6: soft-delete the item', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete(`${ITEMS_URL}/${state.itemId}`)
      .set('Authorization', `Bearer ${state.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'deleted' })
  })

  it('step 7: deleted item no longer in list', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(ITEMS_URL)
      .set('Authorization', `Bearer ${state.token}`)

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
    expect(res.body.data).toHaveLength(0)
  })
})

describe('E2E Flow: user isolation', () => {
  const userA = { username: `user-a-${String(Date.now())}`, password: 'UserAPass123!' }
  const userB = { username: `user-b-${String(Date.now())}`, password: 'UserBPass123!' }
  const tokens = {} as { a: string; b: string }
  const itemIds = {} as { a: string }

  it('register and login both users', async () => {
    const server = ctx.app.getHttpServer()
    await request(server).post(REGISTER_URL).send(userA)
    await request(server).post(REGISTER_URL).send(userB)

    const resA = await request(server).post(LOGIN_URL).send(userA)
    const resB = await request(server).post(LOGIN_URL).send(userB)

    tokens.a = resA.body.accessToken as string
    tokens.b = resB.body.accessToken as string
  })

  it('user A creates an item', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(ITEMS_URL)
      .set('Authorization', `Bearer ${tokens.a}`)
      .send({ title: 'User A private item' })

    expect(res.status).toBe(201)
    itemIds.a = res.body.id as string
  })

  it('user B cannot see user A items', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(ITEMS_URL)
      .set('Authorization', `Bearer ${tokens.b}`)

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
  })

  it('user B cannot delete user A item', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete(`${ITEMS_URL}/${itemIds.a}`)
      .set('Authorization', `Bearer ${tokens.b}`)

    expect(res.status).toBe(404)
  })

  it('user A still sees their item', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(ITEMS_URL)
      .set('Authorization', `Bearer ${tokens.a}`)

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
  })
})

describe('E2E Flow: unauthenticated access', () => {
  it('health endpoint accessible without auth', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status', 'ok')
  })

  it('protected endpoint returns 401 without token', async () => {
    const res = await request(ctx.app.getHttpServer()).get(ITEMS_URL)

    expect(res.status).toBe(401)
  })

  it('register endpoint accessible without auth', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(REGISTER_URL)
      .send({ username: `public-${String(Date.now())}`, password: 'PublicTest123!' })

    expect(res.status).toBe(201)
  })
})
