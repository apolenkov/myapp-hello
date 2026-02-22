import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'

// instrumentation MUST be imported before AppModule so OTel SDK
// registers the PrometheusExporter before custom meters are created
import { prometheusExporter } from '../instrumentation'
import { AppModule } from '../app.module'

/** Create a NestJS test app with AppModule and Prometheus metrics handler (not initialized). */
export async function createBaseTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = moduleRef.createNestApplication()

  const metricsHandler = prometheusExporter.getMetricsRequestHandler.bind(prometheusExporter)
  app.getHttpAdapter().get('/metrics', metricsHandler)

  return app
}
