import type { Express } from 'express'

import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'myapp-hello API', version: '1.0.0' },
    servers: [{ url: 'https://apolenkov.duckdns.org' }],
  },
  apis: ['./src/routes/*.ts'],
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
