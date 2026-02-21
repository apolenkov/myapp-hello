import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool } from 'pg'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool | null

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.get<string>('DATABASE_URL')
    this.pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null
  }

  async query(text: string): Promise<string> {
    if (!this.pool) return 'not configured'
    try {
      await this.pool.query(text)
      return 'connected'
    } catch {
      return 'error'
    }
  }

  async getStatus(): Promise<string> {
    return this.query('SELECT 1')
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
    }
  }
}
