import { join } from 'path'

import type { Express } from 'express'

import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'

const defaultUrl = `http://localhost:${process.env['PORT'] ?? '3001'}`

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'myapp-hello API', version: '1.0.0' },
    servers: [{ url: process.env['PUBLIC_URL'] ?? defaultUrl }],
  },
  // Resolve relative to compiled dist/ in prod, src/ in dev
  apis: [join(__dirname, '*.{ts,js}')],
})

/**
 * Mount Swagger UI at /docs and OpenAPI spec at /openapi.json.
 * @param app - Express application instance
 */
export const setupSwagger = (app: Express): void => {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec))
  app.get('/openapi.json', (_req, res) => {
    res.json(spec)
  })
}
