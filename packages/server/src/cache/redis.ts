import type { CacheAdapter, CacheEntry } from '@aigcs/core'

export function createRedisCache(url?: string): CacheAdapter {
  // Placeholder — Redis is optional (docker-compose profile: with-cache)
  // When enabled, this uses ioredis or @redis/client to set/get/del keys
  // with `aigcs:` prefix and configurable TTL from entry.expiresAt

  console.warn('[cache] Redis adapter not yet implemented; falling back to noop')
  return {
    async get<T>(_key: string): Promise<CacheEntry<T> | null> {
      return null
    },
    async set<T>(_key: string, _entry: CacheEntry<T>): Promise<void> {
      // noop
    },
    async del(_key: string): Promise<void> {
      // noop
    },
  }
}
