#!/usr/bin/env node
// Quick load testing baseline using autocannon (no external tools needed)
// Run: npx autocannon -c 10 -d 30 http://localhost:3001/health
// Or: node load-tests/quick-baseline.mjs [target_url]

import autocannon from 'autocannon'

const TARGET_URL = process.argv[2] || process.env.TARGET_URL || 'http://localhost:3001'

const tests = [
  {
    name: 'Health Check',
    url: `${TARGET_URL}/health`,
    connections: 20,
    duration: 30,
    pipelining: 1,
  },
  {
    name: 'Root Endpoint',
    url: `${TARGET_URL}/`,
    connections: 20,
    duration: 30,
    pipelining: 1,
  },
]

async function runTest(config) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${config.name}: ${config.url}`)
  console.log(`  ${config.connections} connections, ${config.duration}s`)
  console.log('='.repeat(60))

  const result = await autocannon({
    url: config.url,
    connections: config.connections,
    duration: config.duration,
    pipelining: config.pipelining,
  })

  console.log(autocannon.printResult(result))

  return {
    name: config.name,
    rps: Math.round(result.requests.average),
    latencyP50: result.latency.p50,
    latencyP99: result.latency.p99,
    errors: result.errors,
    timeouts: result.timeouts,
    throughput: result.throughput.average,
  }
}

async function main() {
  console.log(`\nLoad Testing Baseline — ${TARGET_URL}`)
  console.log(`Time: ${new Date().toISOString()}\n`)

  const results = []
  for (const test of tests) {
    const result = await runTest(test)
    results.push(result)
  }

  console.log('\n' + '='.repeat(60))
  console.log('  SUMMARY')
  console.log('='.repeat(60))
  console.log(
    `${'Endpoint'.padEnd(20)} ${'RPS'.padStart(8)} ${'P50'.padStart(8)} ${'P99'.padStart(8)} ${'Errors'.padStart(8)}`,
  )
  console.log('-'.repeat(60))
  for (const r of results) {
    console.log(
      `${r.name.padEnd(20)} ${String(r.rps).padStart(8)} ${String(r.latencyP50 + 'ms').padStart(8)} ${String(r.latencyP99 + 'ms').padStart(8)} ${String(r.errors).padStart(8)}`,
    )
  }
}

main().catch((error) => {
  console.error('Load test failed:', error)
  process.exit(1)
})
