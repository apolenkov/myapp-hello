// k6 load test: Authentication flow (register → login)
// Run: k6 run load-tests/auth-flow.js
// Run smoke: k6 run -e PROFILE=smoke load-tests/auth-flow.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { BASE_URL, defaultHeaders, thresholds, stages } from './config.js'

const profile = __ENV.PROFILE || 'baseline'

export const options = {
  stages: stages[profile] || stages.baseline,
  thresholds: thresholds.relaxed,
}

export default function () {
  const uniqueId = `${__VU}-${__ITER}-${Date.now()}`
  const username = `load-test-${uniqueId}`
  const password = 'LoadTest123!'

  // Step 1: Register
  const registerRes = http.post(
    `${BASE_URL}/v1/auth/register`,
    JSON.stringify({ username, password }),
    { headers: defaultHeaders },
  )

  check(registerRes, {
    'register status 201': (r) => r.status === 201,
    'register returns token': (r) => r.json('accessToken') !== undefined,
  })

  if (registerRes.status !== 201) return

  // Step 2: Login
  const loginRes = http.post(`${BASE_URL}/v1/auth/login`, JSON.stringify({ username, password }), {
    headers: defaultHeaders,
  })

  check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'login returns token': (r) => r.json('accessToken') !== undefined,
    'login response < 300ms': (r) => r.timings.duration < 300,
  })

  sleep(0.5)
}
