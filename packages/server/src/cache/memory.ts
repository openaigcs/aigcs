import type { CacheAdapter, CacheEntry } from '@aigcs/core'

interface MemoryEntry<T> {
  data: T
  etag?: string
  expiresAt: number
}

export function createMemoryCache(opts: { maxSize?: number; defaultTtl?: number } = {}): CacheAdapter {
  const maxSize = opts.maxSize ?? 1000
  const defaultTtl = opts.defaultTtl ?? 300
  const store = new Map<string, MemoryEntry<unknown>>()

  function prune() {
    if (store.size <= maxSize) return
    const entries = Array.from(store.entries())
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    const toDelete = entries.slice(0, store.size - maxSize)
    for (const [key] of toDelete) {
      store.delete(key)
    }
  }

  return {
    async get<T>(key: string): Promise<CacheEntry<T> | null> {
      const entry = store.get(key)
      if (!entry) return null
      if (Date.now() > entry.expiresAt) {
        store.delete(key)
        return null
      }
      return { data: entry.data as T, etag: entry.etag, expiresAt: entry.expiresAt }
    },

    async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
      store.set(key, {
        data: entry.data,
        etag: entry.etag,
        expiresAt: entry.expiresAt ?? Date.now() + defaultTtl * 1000,
      })
      prune()
    },

    async del(key: string): Promise<void> {
      store.delete(key)
    },
  }
}
