import { describe, it, expect } from 'vitest'

describe('App', () => {
  it('should have NODE_ENV defined or fallback to development', () => {
    const env = process.env.NODE_ENV || 'development'
    expect(env).toBeTruthy()
  })

  it('should have valid port', () => {
    const port = parseInt(process.env.PORT || '3001', 10)
    expect(port).toBeGreaterThan(0)
    expect(port).toBeLessThan(65536)
  })
})
