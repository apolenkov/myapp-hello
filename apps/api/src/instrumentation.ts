/**
 * Sentry + OpenTelemetry SDK initialization.
 * Sentry.init() MUST run before NodeSDK so it can hook into the OTel pipeline.
 * This file MUST be imported (via --import flag) before express/pg so
 * monkey-patching hooks register in time.
 *
 * Exports the PrometheusExporter instance for mounting /metrics on Express.
 */
import type { IncomingMessage } from 'http'

import * as Sentry from '@sentry/nestjs'
import { SentrySpanProcessor } from '@sentry/opentelemetry'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

import { IGNORED_PATHS } from './constants'

// Sentry — no-op when SENTRY_DSN is not set
Sentry.init({
  dsn: process.env['SENTRY_DSN'],
  skipOpenTelemetrySetup: true,
  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
  environment: process.env['NODE_ENV'] ?? 'development',
})

const prometheusExporter = new PrometheusExporter({ preventServerStart: true })

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? process.env['APP_NAME'] ?? 'myapp-hello',
  'service.namespace': process.env['SERVICE_NAMESPACE'] ?? 'my-application-group',
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

const spanProcessors: SpanProcessor[] = traceExporter
  ? [new SentrySpanProcessor(), new BatchSpanProcessor(traceExporter)]
  : [new SentrySpanProcessor()]

const sdk = new NodeSDK({
  resource,
  metricReader: prometheusExporter,
  spanProcessors,
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (req: IncomingMessage): boolean => {
        const raw = req.url ?? ''
        const qIndex = raw.indexOf('?')
        const pathname = qIndex === -1 ? raw : raw.slice(0, qIndex)
        return IGNORED_PATHS.has(pathname)
      },
    }),
    new ExpressInstrumentation(),
    new PgInstrumentation(),
  ],
})

sdk.start()

export { prometheusExporter }
