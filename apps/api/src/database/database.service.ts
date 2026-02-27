import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { QueryResult } from 'pg'
import { Pool } from 'pg'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name)
  private readonly pool: Pool | null

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.get<string>('DATABASE_URL')
    this.pool = databaseUrl
      ? new Pool({
          connectionString: databaseUrl,
          max: 20,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 30_000,
          statement_timeout: 30_000,
        })
      : null
  }

  /** Whether a DATABASE_URL was provided and a pool created. */
  get isConfigured(): boolean {
    return this.pool !== null
  }

  /** Execute a SQL query, throwing if the database is not configured. */
  async query(text: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Database is not configured')
    }
    return this.pool.query(text, params)
  }

  /**
   * Check database connection status.
   * Returns 'connected', 'error', or 'not configured'.
   */
  async ping(): Promise<string> {
    if (!this.pool) return 'not configured'
    try {
      await this.pool.query('SELECT 1')
      return 'connected'
    } catch (error) {
      this.logger.error(
        'Database health check failed',
        error instanceof Error ? error.stack : String(error),
      )
      return 'error'
    }
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
