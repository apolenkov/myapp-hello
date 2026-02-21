/**
 * OpenTelemetry SDK initialization.
 * MUST be imported before express/pg so monkey-patching hooks register in time.
 *
 * Exports the PrometheusExporter instance for mounting /metrics on Express.
 */
import type { IncomingMessage } from 'http'

import { NodeSDK } from '@opentelemetry/sdk-node'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

const IGNORED_PATHS = new Set(['/health', '/metrics'])

const prometheusExporter = new PrometheusExporter({ preventServerStart: true })

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env['APP_NAME'] ?? 'myapp-hello',
  [ATTR_SERVICE_VERSION]: process.env['npm_package_version'] ?? '0.0.0',
  'deployment.environment': process.env['NODE_ENV'] ?? 'development',
})

const traceExporter = process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
  ? new OTLPTraceExporter({ url: `${process.env['OTEL_EXPORTER_OTLP_ENDPOINT']}/v1/traces` })
  : undefined

const sdk = new NodeSDK({
  resource,
  metricReader: prometheusExporter,
  traceExporter,
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (req: IncomingMessage): boolean =>
        IGNORED_PATHS.has(req.url ?? ''),
    }),
    new ExpressInstrumentation(),
    new PgInstrumentation(),
  ],
})

sdk.start()

export { prometheusExporter }
