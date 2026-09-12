// LRU Session Cache — Instant session loading
// Caches recently accessed sessions in memory.
// Hit = sub-millisecond. Miss = single DB read, then cached.
// Auto-evicts least-recently-used when cache exceeds 200 entries.

export interface CacheEntry<T> {
  value: T
  lastAccess: number
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private maxSize: number

  constructor(maxSize: number = 200) {
    this.maxSize = maxSize
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    entry.lastAccess = Date.now()
    return entry.value
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.get(key)!.value = value
      this.cache.get(key)!.lastAccess = Date.now()
      return
    }
    if (this.cache.size >= this.maxSize) {
      this.evict()
    }
    this.cache.set(key, { value, lastAccess: Date.now() })
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  private evict(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess
        oldestKey = key
      }
    }
    if (oldestKey) this.cache.delete(oldestKey)
  }
}

// Global session cache — 200 entries = ~200KB memory for session metadata
export const sessionCache = new LRUCache<any>(200)

// Global message cache — 500 entries = recent messages for fast re-access
export const messageCache = new LRUCache<any>(500)

// Cache statistics for monitoring
export function getCacheStats() {
  return {
    sessions: sessionCache.size,
    messages: messageCache.size,
  }
}
