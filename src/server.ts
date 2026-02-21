import express from 'express'
import { Pool } from 'pg'

import { runMigrations } from './db/migrate'
import { httpLogger } from './middleware/logger'
import { apiLimiter } from './middleware/rate-limiter'
import { setupSwagger } from './swagger'

const app = express()
const PORT = parseInt(process.env['PORT'] ?? '3001', 10)
const env = process.env['NODE_ENV'] ?? 'development'
const appName = process.env['APP_NAME'] ?? 'myapp-hello'

const pool = process.env['DATABASE_URL']
  ? new Pool({ connectionString: process.env['DATABASE_URL'] })
  : null

// Trust first proxy (Traefik/Nginx) so req.ip resolves to real client IP
app.set('trust proxy', 1)

// Middleware
app.use(httpLogger)
app.use(apiLimiter)
app.use(express.json())

// Swagger docs
setupSwagger(app)

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/**
 * @openapi
 * /:
 *   get:
 *     summary: Hello World with DB status
 *     responses:
 *       200:
 *         description: App info and DB connection status
 */
app.get('/', async (_req, res) => {
  const dbStatus = await (async (): Promise<string> => {
    if (!pool) return 'not configured'
    try {
      await pool.query('SELECT 1')
      return 'connected'
    } catch {
      return 'error'
    }
  })()

  res.json({
    message: 'Hello World!',
    env,
    app: appName,
    db: dbStatus,
    timestamp: new Date().toISOString(),
  })
})

/**
 * Bootstrap the application: run migrations, then start listening.
 * Exported for testing — tests can import app without triggering listen().
 */
async function start(): Promise<void> {
  if (pool) {
    await runMigrations(pool)
  }

  const server = app.listen(PORT, () => {
    console.log(`[${appName}] Running on port ${String(PORT)} (${env})`)
  })

  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down gracefully`)
    server.close(() => {
      if (pool) {
        pool.end(() => {
          console.log('Connections closed, exiting')
          // eslint-disable-next-line n/no-process-exit
          process.exit(0)
        })
      } else {
        // eslint-disable-next-line n/no-process-exit
        process.exit(0)
      }
    })
    // Force exit after 10s if connections don't close
    // eslint-disable-next-line n/no-process-exit
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGTERM', () => {
    shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    shutdown('SIGINT')
  })
}

// Only start when run directly (not imported by tests)
if (require.main === module) {
  start().catch((err: unknown) => {
    console.error('Startup failed:', err)
    // eslint-disable-next-line n/no-process-exit
    process.exit(1)
  })
}

export { app, pool }
