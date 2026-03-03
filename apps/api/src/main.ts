import 'reflect-metadata'

import type { INestApplication } from '@nestjs/common'
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { SentryGlobalFilter } from '@sentry/nestjs/setup'
import compression from 'compression'
import helmet from 'helmet'
import { Logger as PinoLogger } from 'nestjs-pino'

import { prometheusExporter } from './instrumentation'

import { AppModule } from './app.module'
import { UnauthorizedExceptionFilter } from './auth/unauthorized-exception.filter'
import { DEFAULT_NODE_ENV, NODE_ENV_PRODUCTION } from './constants'

function setupSwagger(app: INestApplication): void {
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
}

function setupGracefulShutdown(app: INestApplication): void {
  const server = app.getHttpAdapter().getHttpServer() as {
    close: (cb: () => void) => void
  }
  const shutdownLogger = new Logger('Shutdown')
  process.on('SIGTERM', () => {
    shutdownLogger.log('SIGTERM received, draining HTTP connections…')
    server.close(() => void app.close())
  })
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(PinoLogger))

  const configService = app.get(ConfigService)
  const nodeEnv = configService.get<string>('NODE_ENV', DEFAULT_NODE_ENV)

  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void
  }
  expressApp.set('trust proxy', 1)
  app.use(helmet())
  app.use(compression())
  app.enableCors({ origin: configService.get<string>('CORS_ORIGIN', '*') })
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

  if (nodeEnv !== NODE_ENV_PRODUCTION) setupSwagger(app)

  app
    .getHttpAdapter()
    .get('/metrics', prometheusExporter.getMetricsRequestHandler.bind(prometheusExporter))

  const port = parseInt(configService.get<string>('PORT', '3001'), 10)
  await app.listen(port)
  setupGracefulShutdown(app)

  new Logger('Bootstrap').log(`Server listening on port ${String(port)}`)
}

void bootstrap()
