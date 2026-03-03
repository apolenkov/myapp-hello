import type { Request } from 'express'

export interface JwtPayload {
  sub: string
  iss: string
  aud: string
  iat?: number
  exp?: number
}

export interface RequestWithUser extends Request {
  user: JwtPayload
}
