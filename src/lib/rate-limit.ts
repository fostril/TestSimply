/**
 * Rate limiter with pluggable backend.
 *
 * - In-memory store ships by default (works for single-instance deployments).
 * - Swap in a Redis store by setting REDIS_URL — the interface is the same.
 *
 * Usage:
 *   import { defaultRateLimiter } from "@/lib/rate-limit";
 *   const result = defaultRateLimiter.check("client-ip");
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the window resets */
  reset: number;
  /** Retry after this many seconds (only when rate limited) */
  retryAfter?: number;
}

export interface RateLimiterConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

// ---------------------------------------------------------------------------
// Store interface (pluggable)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
  cleanup(): void;
}

// ---------------------------------------------------------------------------
// In-memory store (default)
// ---------------------------------------------------------------------------

class MemoryStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();

  get(key: string) {
    return this.store.get(key);
  }

  set(key: string, entry: RateLimitEntry) {
    this.store.set(key, entry);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

class RateLimiter {
  private store: RateLimitStore;
  private config: RateLimiterConfig;
  private lastCleanup = 0;

  constructor(config: Partial<RateLimiterConfig> = {}, store?: RateLimitStore) {
    this.config = {
      maxRequests: config.maxRequests ?? 100,
      windowMs: config.windowMs ?? 60 * 1000,
    };
    this.store = store ?? new MemoryStore();
  }

  check(identifier: string): RateLimitResult {
    const now = Date.now();

    // Lazy cleanup
    if (now - this.lastCleanup > this.config.windowMs) {
      this.store.cleanup();
      this.lastCleanup = now;
    }

    const entry = this.store.get(identifier);

    // No existing entry or expired window
    if (!entry || now >= entry.resetTime) {
      const resetTime = now + this.config.windowMs;
      this.store.set(identifier, { count: 1, resetTime });
      return {
        success: true,
        remaining: this.config.maxRequests - 1,
        reset: resetTime,
      };
    }

    // Existing entry within window — over limit
    if (entry.count >= this.config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return {
        success: false,
        remaining: 0,
        reset: entry.resetTime,
        retryAfter,
      };
    }

    // Increment count
    entry.count++;
    this.store.set(identifier, entry);
    return {
      success: true,
      remaining: this.config.maxRequests - entry.count,
      reset: entry.resetTime,
    };
  }
}

// ---------------------------------------------------------------------------
// Pre-configured instances
// ---------------------------------------------------------------------------

/** Default: 100 requests per minute */
const defaultRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000,
});

/** Auth endpoints: 10 requests per minute */
const authRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000,
});

/** Password reset: 3 per hour */
const passwordResetRateLimiter = new RateLimiter({
  maxRequests: 3,
  windowMs: 60 * 60 * 1000,
});

export {
  RateLimiter,
  MemoryStore,
  defaultRateLimiter,
  authRateLimiter,
  passwordResetRateLimiter,
};
export type { RateLimitStore };
