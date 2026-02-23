import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { randomUUID } from 'node:crypto'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { DatabaseModule } from './database/database.module'
import { MetricsModule } from './metrics/metrics.module'

const DEFAULT_THROTTLE_TTL = 60_000
const DEFAULT_THROTTLE_LIMIT = 100

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
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', DEFAULT_THROTTLE_TTL),
          limit: config.get<number>('THROTTLE_LIMIT', DEFAULT_THROTTLE_LIMIT),
        },
      ],
    }),
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
