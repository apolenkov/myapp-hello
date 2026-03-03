// Shared configuration for k6 load tests
// Usage: import { BASE_URL, thresholds, defaultHeaders } from './config.js'

export const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3001'

export const defaultHeaders = {
  'Content-Type': 'application/json',
}

export const thresholds = {
  strict: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
  relaxed: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.05'],
  },
}

export const stages = {
  smoke: [
    { duration: '10s', target: 5 },
    { duration: '30s', target: 5 },
    { duration: '10s', target: 0 },
  ],
  baseline: [
    { duration: '15s', target: 20 },
    { duration: '60s', target: 20 },
    { duration: '15s', target: 0 },
  ],
  stress: [
    { duration: '15s', target: 50 },
    { duration: '60s', target: 50 },
    { duration: '15s', target: 100 },
    { duration: '60s', target: 100 },
    { duration: '15s', target: 0 },
  ],
}
