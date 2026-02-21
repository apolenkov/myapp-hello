import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { requireAuth } from '../middleware/auth'

const TEST_SECRET = 'test-secret-for-unit-tests'

interface MockReqRes {
  req: Request
  res: Response
  next: NextFunction
  statusMock: ReturnType<typeof vi.fn>
  jsonMock: ReturnType<typeof vi.fn>
  nextMock: ReturnType<typeof vi.fn>
}

const createMockReqRes = (authHeader?: string): MockReqRes => {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request

  const statusMock = vi.fn().mockReturnThis()
  const jsonMock = vi.fn().mockReturnThis()
  const res = { status: statusMock, json: jsonMock } as unknown as Response

  const nextMock = vi.fn()
  const next = nextMock as NextFunction

  return { req, res, next, statusMock, jsonMock, nextMock }
}

describe('requireAuth middleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 401 when no Authorization header', () => {
    const { req, res, next, statusMock, jsonMock, nextMock } = createMockReqRes()

    requireAuth(req, res, next)

    expect(statusMock).toHaveBeenCalledWith(401)
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(nextMock).not.toHaveBeenCalled()
  })

  it('should return 401 for invalid token', () => {
    const { req, res, next, statusMock, jsonMock, nextMock } = createMockReqRes(
      'Bearer invalid.token.here',
    )

    requireAuth(req, res, next)

    expect(statusMock).toHaveBeenCalledWith(401)
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid token' })
    expect(nextMock).not.toHaveBeenCalled()
  })

  it('should call next and attach user for valid token', () => {
    vi.stubEnv('JWT_SECRET', TEST_SECRET)
    const payload = { sub: 'user-123', role: 'admin' }
    const token = jwt.sign(payload, TEST_SECRET)
    const { req, res, next, statusMock, nextMock } = createMockReqRes(`Bearer ${token}`)

    requireAuth(req, res, next)

    expect(nextMock).toHaveBeenCalled()
    expect((req as unknown as Record<string, unknown>)['user']).toMatchObject(payload)
    expect(statusMock).not.toHaveBeenCalled()
  })
})
