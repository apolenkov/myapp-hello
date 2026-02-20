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
  res.json({ status: 'ok', env, app: appName })
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
  let dbStatus = 'not configured'

  if (pool) {
    try {
      await pool.query('SELECT 1')
      dbStatus = 'connected'
    } catch {
      dbStatus = 'error'
    }
  }

  res.json({
    message: 'Hello World!',
    env,
    app: appName,
    db: dbStatus,
    timestamp: new Date().toISOString(),
  })
})

// Run DB migrations before accepting traffic (advisory lock prevents races in Swarm)
if (pool) {
  runMigrations(pool).catch((err: unknown) => {
    console.error('Migration failed, exiting:', err)
    process.exit(1)
  })
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
        process.exit(0)
      })
    } else {
      process.exit(0)
    }
  })
  // Force exit after 10s if connections don't close
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM')
})
process.on('SIGINT', () => {
  shutdown('SIGINT')
})

export { app }
