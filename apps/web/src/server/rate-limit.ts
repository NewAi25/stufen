import 'server-only';

// A small sliding window counter kept in memory. One process, one counter:
// it slows a single client down, it is not a shared quota. A deployment with
// several processes needs a shared store before it relies on this.

export interface RateLimiterOptions {
  /** How many hits a key may make inside one window. */
  limit: number;
  windowMs: number;
  now?: () => Date;
  /** Upper bound on remembered keys, so the map cannot grow without end. */
  maxKeys?: number;
}

export interface RateLimiter {
  /** Counts one hit. True when the hit is inside the limit. */
  hit(key: string): boolean;
  /** Forgets everything. For tests. */
  reset(): void;
}

const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = options;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be 1 or more');
  if (!(windowMs > 0)) throw new RangeError('windowMs must be above 0');
  const now = options.now ?? (() => new Date());
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  // Per key: the times of the hits that still count, oldest first.
  const hits = new Map<string, number[]>();

  function prune(cutoff: number): void {
    for (const [key, times] of hits) {
      const kept = times.filter((time) => time > cutoff);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  }

  return {
    hit(key) {
      const time = now().getTime();
      const cutoff = time - windowMs;
      const recent = (hits.get(key) ?? []).filter((entry) => entry > cutoff);

      if (recent.length >= limit) {
        // A refused hit is not stored, so hammering does not extend the block.
        hits.set(key, recent);
        return false;
      }
      if (!hits.has(key) && hits.size >= maxKeys) {
        prune(cutoff);
        // Still full of live keys: drop the oldest one. A Map keeps insertion order.
        if (hits.size >= maxKeys) {
          const oldest = hits.keys().next();
          if (!oldest.done) hits.delete(oldest.value);
        }
      }
      recent.push(time);
      hits.set(key, recent);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}
