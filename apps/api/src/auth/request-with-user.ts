import type { Request } from 'express'

export interface JwtPayload {
  sub: string
  iat?: number
  exp?: number
  iss?: string
  aud?: string
  [key: string]: unknown
}

export interface RequestWithUser extends Request {
  user: JwtPayload
}
