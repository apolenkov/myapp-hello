import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'

import { JwtAuthGuard } from './auth.guard'

@Module({
  imports: [JwtModule.register({ signOptions: { expiresIn: '24h' } })],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AuthModule {}
