import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare, hash } from 'bcrypt'

import { DatabaseService } from '../database/database.service'
import { BCRYPT_ROUNDS, ERROR_INVALID_CREDENTIALS, ERROR_USERNAME_TAKEN } from './auth.constants'
import type { LoginDto } from './dto/login.dto'
import type { RegisterDto } from './dto/register.dto'

interface UserRow {
  id: string
  username: string
  password_hash: string
}

interface AccessTokenResponse {
  accessToken: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AccessTokenResponse> {
    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS)

    try {
      const result = await this.db.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
        [dto.username, passwordHash],
      )
      const user = result.rows[0] as { id: string; username: string }
      return this.createToken(user.id)
    } catch (error) {
      if (error instanceof Error && error.message.includes('unique')) {
        throw new ConflictException(ERROR_USERNAME_TAKEN)
      }
      throw error
    }
  }

  async login(dto: LoginDto): Promise<AccessTokenResponse> {
    const result = await this.db.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [dto.username],
    )
    const user = result.rows[0] as UserRow | undefined

    if (!user) {
      throw new UnauthorizedException(ERROR_INVALID_CREDENTIALS)
    }

    const isValid = await compare(dto.password, user.password_hash)
    if (!isValid) {
      throw new UnauthorizedException(ERROR_INVALID_CREDENTIALS)
    }

    return this.createToken(user.id)
  }

  private createToken(userId: string): AccessTokenResponse {
    const accessToken = this.jwt.sign({ sub: userId })
    return { accessToken }
  }
}
