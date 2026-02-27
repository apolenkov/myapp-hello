import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { DatabaseService } from './database/database.service'

interface HelloResponse {
  message: string
  env: string
  app: string
  db: string
  timestamp: string
}

@Injectable()
export class AppService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async getHello(): Promise<HelloResponse> {
    const dbStatus = await this.db.ping()

    return {
      message: 'Hello World!',
      env: this.config.get<string>('NODE_ENV') ?? 'development',
      app: this.config.get<string>('APP_NAME') ?? 'myapp-hello',
      db: dbStatus,
      timestamp: new Date().toISOString(),
    }
  }

  getHealth(): { status: string } {
    return { status: 'ok' }
  }
}
