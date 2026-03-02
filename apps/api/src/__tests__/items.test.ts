import type { INestApplication } from '@nestjs/common'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppModule } from '../app.module'
import { JWT_AUDIENCE, JWT_ISSUER } from '../auth/jwt.constants'
import { UnauthorizedExceptionFilter } from '../auth/unauthorized-exception.filter'
import { DatabaseService } from '../database/database.service'
import { TEST_JWT_SECRET, testConfigService } from './test-utils'

const ITEMS_URL = '/v1/items'
const UPDATED_TITLE = 'Updated title'

const makeToken = (sub = 'user-123'): string => {
  const jwt = new JwtService({})
  return jwt.sign({ sub }, { secret: TEST_JWT_SECRET, issuer: JWT_ISSUER, audience: JWT_AUDIENCE })
}

const SAMPLE_ROW = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user_id: 'user-123',
  title: 'Test item',
  description: 'A description',
  status: 'active',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
}

const ctx = {} as { app: INestApplication; dbQuery: ReturnType<typeof vi.fn> }

beforeAll(async () => {
  const dbQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue(testConfigService)
    .overrideProvider(DatabaseService)
    .useValue({
      ping: vi.fn().mockResolvedValue('connected'),
      isConfigured: true,
      query: dbQuery,
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
  ctx.dbQuery = dbQuery
})

afterAll(async () => {
  await ctx.app.close()
})

beforeEach(() => {
  ctx.dbQuery.mockReset()
  ctx.dbQuery.mockResolvedValue({ rows: [], rowCount: 0 })
})

describe('POST /v1/items', () => {
  it('should create an item with valid data', async () => {
    ctx.dbQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW], rowCount: 1 })

    const res = await request(ctx.app.getHttpServer())
      .post(ITEMS_URL)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'Test item', description: 'A description' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ id: SAMPLE_ROW.id, title: 'Test item', status: 'active' })
  })

  it('should return 401 without auth token', async () => {
    const res = await request(ctx.app.getHttpServer()).post(ITEMS_URL).send({ title: 'Test item' })

    expect(res.status).toBe(401)
  })

  it('should return 400 when title is missing', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(ITEMS_URL)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ description: 'No title' })

    expect(res.status).toBe(400)
  })

  it('should return 400 when title is empty', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(ITEMS_URL)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: '' })

    expect(res.status).toBe(400)
  })

  it('should return 400 for unknown fields (forbidNonWhitelisted)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(ITEMS_URL)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'Valid', unknownField: 'hacker' })

    expect(res.status).toBe(400)
  })
})

describe('GET /v1/items', () => {
  it('should return paginated items', async () => {
    ctx.dbQuery.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_ROW, full_count: '1' }],
      rowCount: 1,
    })

    const res = await request(ctx.app.getHttpServer())
      .get(ITEMS_URL)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ data: [{ id: SAMPLE_ROW.id }], total: 1, page: 1, limit: 20 })
  })

  it('should return empty list when no items', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(ITEMS_URL)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ data: [], total: 0 })
  })

  it('should accept page and limit query params', async () => {
    ctx.dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const res = await request(ctx.app.getHttpServer())
      .get(`${ITEMS_URL}?page=2&limit=5`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(ctx.dbQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 5, 5])
  })

  it('should clamp limit to max 100', async () => {
    ctx.dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    await request(ctx.app.getHttpServer())
      .get(`${ITEMS_URL}?limit=999`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(ctx.dbQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 100, 0])
  })
})

describe('GET /v1/items/:id', () => {
  it('should return a single item', async () => {
    ctx.dbQuery.mockResolvedValueOnce({ rows: [SAMPLE_ROW], rowCount: 1 })

    const res = await request(ctx.app.getHttpServer())
      .get(`${ITEMS_URL}/${SAMPLE_ROW.id}`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: SAMPLE_ROW.id, title: 'Test item' })
  })

  it('should return 404 when item not found', async () => {
    ctx.dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const res = await request(ctx.app.getHttpServer())
      .get(`${ITEMS_URL}/550e8400-e29b-41d4-a716-446655440001`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(404)
  })

  it('should return 400 for invalid UUID', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`${ITEMS_URL}/not-a-uuid`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(400)
  })
})

describe('PATCH /v1/items/:id', () => {
  it('should update an item', async () => {
    const updatedRow = { ...SAMPLE_ROW, title: UPDATED_TITLE }
    ctx.dbQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 })

    const res = await request(ctx.app.getHttpServer())
      .patch(`${ITEMS_URL}/${SAMPLE_ROW.id}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: UPDATED_TITLE })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: UPDATED_TITLE })
  })

  it('should return 404 when item not found', async () => {
    ctx.dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const res = await request(ctx.app.getHttpServer())
      .patch(`${ITEMS_URL}/${SAMPLE_ROW.id}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'Updated' })

    expect(res.status).toBe(404)
  })

  it('should return 400 for invalid status value', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`${ITEMS_URL}/${SAMPLE_ROW.id}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ status: 'deleted' })

    expect(res.status).toBe(400)
  })
})

describe('DELETE /v1/items/:id', () => {
  it('should soft-delete an item', async () => {
    const deletedRow = { ...SAMPLE_ROW, status: 'deleted' }
    ctx.dbQuery.mockResolvedValueOnce({ rows: [deletedRow], rowCount: 1 })

    const res = await request(ctx.app.getHttpServer())
      .delete(`${ITEMS_URL}/${SAMPLE_ROW.id}`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'deleted' })
  })

  it('should return 404 when item already deleted', async () => {
    ctx.dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    const res = await request(ctx.app.getHttpServer())
      .delete(`${ITEMS_URL}/${SAMPLE_ROW.id}`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(404)
  })
})

describe('Items — user isolation', () => {
  it('should scope queries to authenticated user', async () => {
    ctx.dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })

    await request(ctx.app.getHttpServer())
      .get(ITEMS_URL)
      .set('Authorization', `Bearer ${makeToken('other-user')}`)

    expect(ctx.dbQuery).toHaveBeenCalledWith(expect.any(String), ['other-user', 20, 0])
  })
})
