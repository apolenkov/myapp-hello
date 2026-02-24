/**
 * Sentry + OpenTelemetry SDK initialization.
 * Sentry.init() MUST run before NodeSDK so it can hook into the OTel pipeline.
 * This file MUST be imported before express/pg so monkey-patching hooks register in time.
 *
 * Exports the PrometheusExporter instance for mounting /metrics on Express.
 */
import type { IncomingMessage } from 'http'

import * as Sentry from '@sentry/nestjs'
import { SentrySpanProcessor } from '@sentry/opentelemetry'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

// Sentry — no-op when SENTRY_DSN is not set
Sentry.init({
  dsn: process.env['SENTRY_DSN'],
  skipOpenTelemetrySetup: true,
  tracesSampleRate: 1.0,
  environment: process.env['NODE_ENV'] ?? 'development',
})

const IGNORED_PATHS = new Set(['/health', '/metrics'])

const prometheusExporter = new PrometheusExporter({ preventServerStart: true })

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env['APP_NAME'] ?? 'myapp-hello',
  [ATTR_SERVICE_VERSION]: process.env['npm_package_version'] ?? '0.0.0',
  'deployment.environment': process.env['NODE_ENV'] ?? 'development',
})

const createTraceExporter = (): OTLPTraceExporter | undefined => {
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
  if (!endpoint) return undefined
  try {
    return new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
  } catch (error) {
    console.warn(
      'Failed to initialize OTel trace exporter, traces will be disabled:',
      error instanceof Error ? error.message : String(error),
    )
    return undefined
  }
}

const traceExporter = createTraceExporter()

const sdk = new NodeSDK({
  resource,
  metricReader: prometheusExporter,
  traceExporter,
  spanProcessors: [new SentrySpanProcessor()],
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
