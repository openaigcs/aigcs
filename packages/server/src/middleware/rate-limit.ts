import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { getDb } from '../db/index.js'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const memoryStore = new Map<string, RateLimitEntry>()

// Clean stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of memoryStore) {
    if (now > entry.resetAt) memoryStore.delete(key)
  }
  if (memoryStore.size > 50000) memoryStore.clear()
}, CLEANUP_INTERVAL)

export function rateLimiter(opts: { max?: number; window?: number; keyFn?: (c: any) => string } = {}) {
  const max = opts.max ?? parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
  const window = opts.window ?? parseInt(process.env.RATE_LIMIT_WINDOW || '60', 10)
  const keyFn = opts.keyFn ?? ((c) => {
    return c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  })

  return createMiddleware(async (c, next) => {
    const key = keyFn(c)
    const now = Date.now()
    const entry = memoryStore.get(key)

    if (!entry || now > entry.resetAt) {
      memoryStore.set(key, { count: 1, resetAt: now + window * 1000 })
      return next()
    }

    if (entry.count >= max) {
      throw new HTTPException(429, { message: 'Too many requests' })
    }

    entry.count++
    return next()
  })
}
