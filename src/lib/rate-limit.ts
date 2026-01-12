/**
 * Simple in-memory rate limiter using sliding window algorithm.
 * For production with multiple instances, use Redis-based rate limiting.
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

interface RateLimiterConfig {
    /** Maximum number of requests allowed in the window */
    maxRequests: number;
    /** Window size in milliseconds */
    windowMs: number;
}

interface RateLimitResult {
    /** Whether the request is allowed */
    success: boolean;
    /** Number of remaining requests in the current window */
    remaining: number;
    /** Unix timestamp (ms) when the window resets */
    reset: number;
    /** Retry after this many seconds (only when rate limited) */
    retryAfter?: number;
}

class RateLimiter {
    private store = new Map<string, RateLimitEntry>();
    private config: RateLimiterConfig;
    private lastCleanup = 0;

    constructor(config: Partial<RateLimiterConfig> = {}) {
        this.config = {
            maxRequests: config.maxRequests ?? 100,
            windowMs: config.windowMs ?? 60 * 1000, // 1 minute default
        };
    }

    /**
     * Check if a request from the given identifier should be allowed.
     */
    check(identifier: string): RateLimitResult {
        const now = Date.now();

        // Lazy cleanup - run periodically instead of setInterval
        if (now - this.lastCleanup > this.config.windowMs) {
            this.cleanup();
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

        // Existing entry within window
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
        return {
            success: true,
            remaining: this.config.maxRequests - entry.count,
            reset: entry.resetTime,
        };
    }

    /**
     * Remove expired entries to prevent memory leaks.
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now >= entry.resetTime) {
                this.store.delete(key);
            }
        }
    }
}

// Default rate limiter: 100 requests per minute
const defaultRateLimiter = new RateLimiter({
    maxRequests: 100,
    windowMs: 60 * 1000,
});

// Stricter rate limiter for auth endpoints: 10 requests per minute
const authRateLimiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 60 * 1000,
});

// Very strict for password reset: 3 per hour
const passwordResetRateLimiter = new RateLimiter({
    maxRequests: 3,
    windowMs: 60 * 60 * 1000,
});

export {
    RateLimiter,
    defaultRateLimiter,
    authRateLimiter,
    passwordResetRateLimiter,
};
export type { RateLimitResult, RateLimiterConfig };

