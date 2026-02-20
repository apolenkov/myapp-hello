import { randomUUID } from 'crypto'

import pino from 'pino'
import pinoHttp from 'pino-http'

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  formatters: { level: (label) => ({ level: label }) },
})

export const httpLogger = pinoHttp({
  logger,
  genReqId: () => randomUUID(),
  customLogLevel: (_req, res) => (res.statusCode >= 500 ? 'error' : 'info'),
})
