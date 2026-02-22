import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { randomUUID } from 'node:crypto'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { DatabaseModule } from './database/database.module'
import { MetricsModule } from './metrics/metrics.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: () => randomUUID(),
        customLogLevel: (_req: unknown, res: { statusCode: number }) => {
          if (res.statusCode >= 500) return 'error'
          if (res.statusCode >= 400) return 'warn'
          return 'info'
        },
        level: process.env['LOG_LEVEL'] ?? 'info',
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    AuthModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
