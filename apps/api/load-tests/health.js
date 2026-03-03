// k6 load test: Health endpoint baseline
// Run: k6 run load-tests/health.js
// Run smoke: k6 run -e PROFILE=smoke load-tests/health.js
// Run against staging: k6 run -e TARGET_URL=https://staging.example.com load-tests/health.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { BASE_URL, thresholds, stages } from './config.js'

const profile = __ENV.PROFILE || 'baseline'

export const options = {
  stages: stages[profile] || stages.baseline,
  thresholds: thresholds.strict,
}

export default function () {
  const res = http.get(`${BASE_URL}/health`)

  check(res, {
    'status is 200': (r) => r.status === 200,
    'body has status ok': (r) => r.json('status') === 'ok',
    'body has db field': (r) => r.json('db') !== undefined,
    'response time < 100ms': (r) => r.timings.duration < 100,
  })

  sleep(0.1)
}
