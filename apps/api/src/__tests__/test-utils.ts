import type { INestApplication } from '@nestjs/common'
import { VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'

// instrumentation MUST be imported before AppModule so OTel SDK
// registers the PrometheusExporter before custom meters are created
import { prometheusExporter } from '../instrumentation'
import { AppModule } from '../app.module'
import { UnauthorizedExceptionFilter } from '../auth/unauthorized-exception.filter'

const TEST_CONFIG: Record<string, string> = {
  JWT_SECRET: 'test-secret-for-unit-tests',
  NODE_ENV: 'test',
  APP_NAME: 'myapp-hello',
  THROTTLE_TTL: '60000',
  THROTTLE_LIMIT: '100',
}

/** Create a mock ConfigService from a config record. */
export const createMockConfigService = (
  config: Record<string, string>,
): {
  get: <T = string>(key: string, defaultValue?: T) => T | undefined
  getOrThrow: (key: string) => string
} => ({
  get: <T = string>(key: string, defaultValue?: T): T | undefined =>
    (config[key] as T | undefined) ?? defaultValue,
  getOrThrow: (key: string): string => {
    const value = config[key]
    if (value === undefined) throw new Error(`Configuration key "${key}" does not exist`)
    return value
  },
})

export const testConfigService = createMockConfigService(TEST_CONFIG)

/** Create a NestJS test app with AppModule and Prometheus metrics handler (not initialized). */
export async function createBaseTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue(testConfigService)
    .compile()

  const app = moduleRef.createNestApplication()

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })

  const metricsHandler = prometheusExporter.getMetricsRequestHandler.bind(prometheusExporter)
  app.getHttpAdapter().get('/metrics', metricsHandler)
  app.useGlobalFilters(new UnauthorizedExceptionFilter())

  return app
}
