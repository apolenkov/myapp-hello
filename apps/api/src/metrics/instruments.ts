/**
 * Custom application metrics using OpenTelemetry API.
 * Prometheus exporter collects these automatically via the shared MeterProvider.
 */
import { metrics } from '@opentelemetry/api'

import {
  HTTP_HISTOGRAM_BUCKETS,
  METER_NAME,
  METRIC_HTTP_REQUEST_DURATION,
  METRIC_HTTP_REQUESTS,
} from './metrics.constants'

const meter = metrics.getMeter(METER_NAME)

/** Histogram: HTTP request duration in seconds. */
export const httpRequestDuration = meter.createHistogram(METRIC_HTTP_REQUEST_DURATION, {
  description: 'HTTP request duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: HTTP_HISTOGRAM_BUCKETS,
  },
})

/** Counter: total HTTP requests. */
export const httpRequestsTotal = meter.createCounter(METRIC_HTTP_REQUESTS, {
  description: 'Total HTTP requests',
})
