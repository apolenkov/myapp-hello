import type { RequestHandler } from 'express'

import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env['JWT_SECRET'] ?? ''

/**
 * Middleware to verify Bearer JWT token on protected routes.
 * Returns 401 if token is missing or invalid.
 * Enable by attaching to specific routes: router.get('/protected', requireAuth, handler)
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    ;(req as unknown as Record<string, unknown>)['user'] = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
