import 'reflect-metadata'

import { Logger, ValidationPipe, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { SentryGlobalFilter } from '@sentry/nestjs/setup'
import helmet from 'helmet'
import { Logger as PinoLogger } from 'nestjs-pino'

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
  app.use(helmet())
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  app.enableShutdownHooks()
  const { httpAdapter } = app.get(HttpAdapterHost)
  app.useGlobalFilters(new SentryGlobalFilter(httpAdapter), new UnauthorizedExceptionFilter())

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

  const configService = app.get(ConfigService)
  const port = parseInt(configService.get<string>('PORT', '3001'), 10)
  await app.listen(port)

  const nestLogger = new Logger('Bootstrap')
  nestLogger.log(`Server listening on port ${String(port)}`)
}

void bootstrap()
