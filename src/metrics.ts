/**
 * Custom application metrics using OpenTelemetry API.
 * Prometheus exporter collects these automatically via the shared MeterProvider.
 */
import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('myapp-hello')

/** Histogram: HTTP request duration in seconds. */
export const httpRequestDuration = meter.createHistogram('http_request_duration', {
  description: 'HTTP request duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  },
})

/** Counter: total HTTP requests. */
export const httpRequestsTotal = meter.createCounter('http_requests', {
  description: 'Total HTTP requests',
})
