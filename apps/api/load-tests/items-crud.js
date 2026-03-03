// k6 load test: Full CRUD flow (register → login → create → list → get → delete)
// Run: k6 run load-tests/items-crud.js
// Run smoke: k6 run -e PROFILE=smoke load-tests/items-crud.js

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { BASE_URL, defaultHeaders, thresholds, stages } from './config.js'

const profile = __ENV.PROFILE || 'baseline'

export const options = {
  stages: stages[profile] || stages.baseline,
  thresholds: thresholds.relaxed,
}

function authHeaders(token) {
  return { ...defaultHeaders, Authorization: `Bearer ${token}` }
}

function authenticate() {
  const uniqueId = `${__VU}-${__ITER}-${Date.now()}`
  const username = `load-crud-${uniqueId}`
  const password = 'LoadCrud123!'

  const registerRes = http.post(
    `${BASE_URL}/v1/auth/register`,
    JSON.stringify({ username, password }),
    { headers: defaultHeaders },
  )

  if (registerRes.status !== 201) return null
  return registerRes.json('accessToken')
}

export default function () {
  // Setup: register and get token
  const token = authenticate()
  if (!token) return

  const headers = authHeaders(token)

  // Create item
  let itemId
  group('create item', () => {
    const res = http.post(
      `${BASE_URL}/v1/items`,
      JSON.stringify({ title: `Load test item ${__VU}-${__ITER}`, description: 'Created by k6' }),
      { headers },
    )

    check(res, {
      'create status 201': (r) => r.status === 201,
      'create returns id': (r) => r.json('id') !== undefined,
      'create has active status': (r) => r.json('status') === 'active',
    })

    if (res.status === 201) {
      itemId = res.json('id')
    }
  })

  if (!itemId) return

  // List items
  group('list items', () => {
    const res = http.get(`${BASE_URL}/v1/items`, { headers })

    check(res, {
      'list status 200': (r) => r.status === 200,
      'list has data array': (r) => Array.isArray(r.json('data')),
      'list total >= 1': (r) => r.json('total') >= 1,
    })
  })

  // Get single item
  group('get item', () => {
    const res = http.get(`${BASE_URL}/v1/items/${itemId}`, { headers })

    check(res, {
      'get status 200': (r) => r.status === 200,
      'get returns correct id': (r) => r.json('id') === itemId,
    })
  })

  // Soft-delete item
  group('delete item', () => {
    const res = http.del(`${BASE_URL}/v1/items/${itemId}`, null, { headers })

    check(res, {
      'delete status 200': (r) => r.status === 200,
      'delete returns deleted status': (r) => r.json('status') === 'deleted',
    })
  })

  // Verify deletion
  group('verify deletion', () => {
    const res = http.get(`${BASE_URL}/v1/items`, { headers })

    check(res, {
      'after delete total is 0': (r) => r.json('total') === 0,
    })
  })

  sleep(0.5)
}
