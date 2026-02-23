import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool } from 'pg'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name)
  readonly pool: Pool | null

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.get<string>('DATABASE_URL')
    this.pool = databaseUrl
      ? new Pool({
          connectionString: databaseUrl,
          connectionTimeoutMillis: 30_000,
          statement_timeout: 30_000,
        })
      : null
  }

  async query(text: string): Promise<string> {
    if (!this.pool) return 'not configured'
    try {
      await this.pool.query(text)
      return 'connected'
    } catch (error) {
      this.logger.error(
        'Database query failed',
        error instanceof Error ? error.stack : String(error),
      )
      return 'error'
    }
  }

  async getStatus(): Promise<string> {
    return this.query('SELECT 1')
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          this.logger.warn('Pool shutdown timed out after 10s, forcing close')
          resolve()
        }, 10_000)
      })
      await Promise.race([this.pool.end(), timeout])
    }
  }
}
