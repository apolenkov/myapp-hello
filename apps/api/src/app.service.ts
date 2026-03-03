import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { DEFAULT_APP_NAME, DEFAULT_NODE_ENV, NODE_ENV_PRODUCTION } from './constants'
import { DatabaseService } from './database/database.service'

interface HelloResponse {
  message: string
  app: string
  timestamp: string
  env?: string
  db?: string
}

@Injectable()
export class AppService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async getHello(): Promise<HelloResponse> {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? DEFAULT_NODE_ENV
    const response: HelloResponse = {
      message: 'Hello World!',
      app: this.config.get<string>('APP_NAME') ?? DEFAULT_APP_NAME,
      timestamp: new Date().toISOString(),
    }

    if (nodeEnv !== NODE_ENV_PRODUCTION) {
      response.env = nodeEnv
      response.db = await this.db.ping()
    }

    return response
  }

  getHealth(): { status: string } {
    return { status: 'ok' }
  }
}
