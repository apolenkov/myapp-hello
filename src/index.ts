import express from 'express'
import { Pool } from 'pg'

const app = express()
const port = parseInt(process.env.PORT || '3001', 10)
const env = process.env.NODE_ENV || 'development'
const appName = process.env.APP_NAME || 'myapp-hello'

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env, app: appName })
})

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

app.listen(port, () => {
  console.log(`[${appName}] Running on port ${port} (${env})`)
})

export { app }
