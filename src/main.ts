import 'reflect-metadata'

import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger as PinoLogger } from 'nestjs-pino'

// instrumentation MUST be imported before AppModule so OTel SDK
// registers the PrometheusExporter before custom meters are created
import { prometheusExporter } from './instrumentation'
import { AppModule } from './app.module'
import { UnauthorizedExceptionFilter } from './auth/unauthorized-exception.filter'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  const logger = app.get(PinoLogger)
  app.useLogger(logger)

  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void
  }
  expressApp.set('trust proxy', 1)
  app.useGlobalFilters(new UnauthorizedExceptionFilter())

  const config = new DocumentBuilder()
    .setTitle('myapp-hello API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)
  app
    .getHttpAdapter()
    .get('/openapi.json', (_req: unknown, res: { json: (body: unknown) => void }) => {
      res.json(document)
    })

  const metricsHandler = prometheusExporter.getMetricsRequestHandler.bind(prometheusExporter)
  app.getHttpAdapter().get('/metrics', metricsHandler)

  const port = parseInt(process.env['PORT'] ?? '3001', 10)
  await app.listen(port)

  const nestLogger = new Logger('Bootstrap')
  nestLogger.log(`Server listening on port ${String(port)}`)

  const shutdown = async (signal: string): Promise<void> => {
    nestLogger.log(`${signal} received — shutting down`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

void bootstrap()
