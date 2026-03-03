import { Global, Logger, Module, OnModuleInit } from '@nestjs/common'

import { DatabaseService } from './database.service'
import { runMigrations } from './migrate'

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseModule.name)

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    const pool = this.db.rawPool
    if (!pool) return

    try {
      await runMigrations(pool)
    } catch (error) {
      this.logger.error('Migration failed', error instanceof Error ? error.stack : String(error))
    }
  }
}
