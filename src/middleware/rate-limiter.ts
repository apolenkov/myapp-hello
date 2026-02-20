import rateLimit from 'express-rate-limit'

/**
 * API rate limiter: 100 requests per minute per IP.
 * Acts as first-pass safety net — also configure at Traefik level for production.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})
