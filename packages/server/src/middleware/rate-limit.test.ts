import { describe, it, expect, vi } from 'vitest'
import { rateLimiter } from './rate-limit.js'

function createMockC(ip?: string) {
  return {
    req: {
      header: (name: string) => {
        if (name === 'x-forwarded-for') return ip || '127.0.0.1'
        if (name === 'x-real-ip') return undefined
        return undefined
      },
    },
    set: vi.fn(),
    get: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    res: vi.fn(),
  }
}

describe('rateLimiter', () => {
  it('should allow requests within limit', async () => {
    const limiter = rateLimiter({ max: 5, window: 60 })
    const mockC = createMockC('10.0.0.1')
    const next = vi.fn()

    for (let i = 0; i < 5; i++) {
      await limiter(mockC as any, next)
    }

    expect(next).toHaveBeenCalledTimes(5)
  })

  it('should block requests exceeding limit', async () => {
    const limiter = rateLimiter({ max: 3, window: 60 })
    const mockC = createMockC('10.0.0.2')
    const next = vi.fn()

    for (let i = 0; i < 3; i++) {
      await limiter(mockC as any, next)
    }

    let err: unknown
    try {
      await limiter(mockC as any, vi.fn())
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect((err as Error).message).toBe('Too many requests')
  })

  it('should reset after window expires', async () => {
    vi.useFakeTimers()
    try {
      const limiter = rateLimiter({ max: 2, window: 60 })
      const mockC = createMockC('10.0.0.3')
      const next = vi.fn()

      await limiter(mockC as any, next)
      await limiter(mockC as any, next)

      let err: unknown
      try {
        await limiter(mockC as any, vi.fn())
      } catch (e) {
        err = e
      }
      expect(err).toBeDefined()

      vi.advanceTimersByTime(61_000)

      await limiter(mockC as any, next)
      expect(next).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('should use different keys for different IPs', async () => {
    const limiter = rateLimiter({ max: 2, window: 60 })
    const next = vi.fn()

    const c1 = createMockC('10.0.0.4')
    const c2 = createMockC('10.0.0.5')

    await limiter(c1 as any, next)
    await limiter(c1 as any, next)

    let err: unknown
    try {
      await limiter(c1 as any, vi.fn())
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(next).toHaveBeenCalledTimes(2)

    const next2 = vi.fn()
    await limiter(c2 as any, next2)
    await limiter(c2 as any, next2)
    expect(next2).toHaveBeenCalledTimes(2)
  })

  it('should use custom key function', async () => {
    const limiter = rateLimiter({
      max: 1,
      window: 60,
      keyFn: () => 'custom-key',
    })
    const mockC = createMockC('10.0.0.6')
    const next = vi.fn()

    await limiter(mockC as any, next)
    expect(next).toHaveBeenCalledTimes(1)

    let err: unknown
    try {
      await limiter(mockC as any, vi.fn())
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect((err as Error).message).toBe('Too many requests')
  })
})
