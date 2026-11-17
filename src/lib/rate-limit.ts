import net from "net";
import tls from "tls";

/**
 * Rate limiter with pluggable backend.
 *
 * - In-memory store ships by default (works for single-instance deployments).
 * - When `REDIS_URL` is configured, `checkAsync()` uses an atomic Redis-backed
 *   store (`RedisStore`) and gracefully falls back to `MemoryStore` if Redis is
 *   temporarily unreachable.
 *
 * Usage:
 *   import { defaultRateLimiter } from "@/lib/rate-limit";
 *   const result = await defaultRateLimiter.checkAsync("client-ip");
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
  /** Optional key prefix when sharing a store across limiters */
  prefix?: string;
}

// ---------------------------------------------------------------------------
// Store interface (pluggable)
// ---------------------------------------------------------------------------

export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined | Promise<RateLimitEntry | undefined>;
  set(key: string, entry: RateLimitEntry): void | Promise<void>;
  cleanup(): void | Promise<void>;
  increment?(key: string, windowMs: number): Promise<RateLimitEntry>;
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

  clear() {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Minimal zero-dependency Redis store (RESP2 over net/tls)
// ---------------------------------------------------------------------------

function encodeResp(args: string[]): string {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const buf = Buffer.from(arg, "utf8");
    out += `$${buf.length}\r\n${arg}\r\n`;
  }
  return out;
}

function parseRespValue(buf: Buffer, offset = 0): { value: unknown; nextOffset: number } | null {
  if (offset >= buf.length) return null;
  const prefix = String.fromCharCode(buf[offset]);
  const lineEnd = buf.indexOf("\r\n", offset);
  if (lineEnd === -1) return null;
  const header = buf.toString("utf8", offset + 1, lineEnd);

  if (prefix === "+" || prefix === "-") {
    if (prefix === "-") throw new Error(`Redis error: ${header}`);
    return { value: header, nextOffset: lineEnd + 2 };
  }
  if (prefix === ":") {
    return { value: parseInt(header, 10), nextOffset: lineEnd + 2 };
  }
  if (prefix === "$") {
    const len = parseInt(header, 10);
    if (len === -1) return { value: null, nextOffset: lineEnd + 2 };
    const end = lineEnd + 2 + len;
    if (buf.length < end + 2) return null;
    return { value: buf.toString("utf8", lineEnd + 2, end), nextOffset: end + 2 };
  }
  if (prefix === "*") {
    const count = parseInt(header, 10);
    if (count === -1) return { value: null, nextOffset: lineEnd + 2 };
    const arr: unknown[] = [];
    let cursor = lineEnd + 2;
    for (let i = 0; i < count; i++) {
      const parsed = parseRespValue(buf, cursor);
      if (!parsed) return null;
      arr.push(parsed.value);
      cursor = parsed.nextOffset;
    }
    return { value: arr, nextOffset: cursor };
  }
  throw new Error(`Unsupported RESP prefix: ${prefix}`);
}

const LUA_FIXED_WINDOW =
  "local c = redis.call('INCR', KEYS[1]); " +
  "if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; " +
  "local ttl = redis.call('PTTL', KEYS[1]); " +
  "return {c, ttl}";

export class RedisStore implements RateLimitStore {
  private url: URL;

  constructor(redisUrl: string) {
    this.url = new URL(redisUrl);
  }

  private async execCommands(commands: string[][]): Promise<unknown[]> {
    const port = this.url.port ? parseInt(this.url.port, 10) : 6379;
    const host = this.url.hostname || "127.0.0.1";
    const useTls = this.url.protocol === "rediss:";

    const preamble: string[][] = [];
    if (this.url.password) {
      const password = decodeURIComponent(this.url.password);
      if (this.url.username) {
        preamble.push(["AUTH", decodeURIComponent(this.url.username), password]);
      } else {
        preamble.push(["AUTH", password]);
      }
    }
    const dbMatch = this.url.pathname.match(/^\/(\d+)$/);
    if (dbMatch && dbMatch[1] !== "0") {
      preamble.push(["SELECT", dbMatch[1]]);
    }

    const allCommands = [...preamble, ...commands];

    return new Promise((resolve, reject) => {
      const socket = useTls
        ? tls.connect({ host, port })
        : net.createConnection({ host, port });

      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("Redis connection timeout"));
      }, 2000);

      let buffer = Buffer.alloc(0);
      const results: unknown[] = [];

      socket.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      socket.on("connect", () => {
        const payload = allCommands.map(encodeResp).join("");
        socket.write(payload);
      });

      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        try {
          while (results.length < allCommands.length) {
            const parsed = parseRespValue(buffer, 0);
            if (!parsed) break;
            results.push(parsed.value);
            buffer = buffer.subarray(parsed.nextOffset);
          }
          if (results.length >= allCommands.length) {
            clearTimeout(timeout);
            socket.end();
            resolve(results.slice(preamble.length));
          }
        } catch (err) {
          clearTimeout(timeout);
          socket.destroy();
          reject(err);
        }
      });
    });
  }

  async get(key: string): Promise<RateLimitEntry | undefined> {
    const [raw] = await this.execCommands([["GET", key]]);
    if (typeof raw !== "string") return undefined;
    try {
      return JSON.parse(raw) as RateLimitEntry;
    } catch {
      return undefined;
    }
  }

  async set(key: string, entry: RateLimitEntry): Promise<void> {
    const ttlMs = Math.max(1, entry.resetTime - Date.now());
    await this.execCommands([["SET", key, JSON.stringify(entry), "PX", String(ttlMs)]]);
  }

  async cleanup(): Promise<void> {
    // Redis automatically expires keys via PEXPIRE/PX
  }

  async increment(key: string, windowMs: number): Promise<RateLimitEntry> {
    const [res] = await this.execCommands([
      ["EVAL", LUA_FIXED_WINDOW, "1", key, String(windowMs)],
    ]);
    const [countRaw, ttlRaw] = res as [number, number];
    const ttl = ttlRaw > 0 ? ttlRaw : windowMs;
    return {
      count: countRaw,
      resetTime: Date.now() + ttl,
    };
  }
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

class RateLimiter {
  private memoryFallback = new MemoryStore();
  private store: RateLimitStore;
  private config: RateLimiterConfig;
  private lastCleanup = 0;

  constructor(config: Partial<RateLimiterConfig> = {}, store?: RateLimitStore) {
    this.config = {
      maxRequests: config.maxRequests ?? 100,
      windowMs: config.windowMs ?? 60 * 1000,
      prefix: config.prefix ?? "rl",
    };
    if (store) {
      this.store = store;
    } else if (process.env.REDIS_URL) {
      this.store = new RedisStore(process.env.REDIS_URL);
    } else {
      this.store = this.memoryFallback;
    }
  }

  private buildResult(count: number, resetTime: number, now: number): RateLimitResult {
    if (count > this.config.maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((resetTime - now) / 1000));
      return {
        success: false,
        remaining: 0,
        reset: resetTime,
        retryAfter,
      };
    }
    return {
      success: true,
      remaining: Math.max(0, this.config.maxRequests - count),
      reset: resetTime,
    };
  }

  private checkInMemory(store: MemoryStore, key: string): RateLimitResult {
    const now = Date.now();
    if (now - this.lastCleanup > this.config.windowMs) {
      store.cleanup();
      this.lastCleanup = now;
    }

    const entry = store.get(key);
    if (!entry || now >= entry.resetTime) {
      const resetTime = now + this.config.windowMs;
      store.set(key, { count: 1, resetTime });
      return this.buildResult(1, resetTime, now);
    }

    if (entry.count >= this.config.maxRequests) {
      return this.buildResult(entry.count + 1, entry.resetTime, now);
    }

    entry.count++;
    store.set(key, entry);
    return this.buildResult(entry.count, entry.resetTime, now);
  }

  check(identifier: string): RateLimitResult {
    const key = `${this.config.prefix}:${identifier}`;
    if (this.store instanceof MemoryStore) {
      return this.checkInMemory(this.store, key);
    }
    return this.checkInMemory(this.memoryFallback, key);
  }

  async checkAsync(identifier: string): Promise<RateLimitResult> {
    const key = `${this.config.prefix}:${identifier}`;
    if (this.store instanceof MemoryStore) {
      return this.checkInMemory(this.store, key);
    }

    const now = Date.now();
    try {
      if (this.store.increment) {
        const entry = await this.store.increment(key, this.config.windowMs);
        return this.buildResult(entry.count, entry.resetTime, now);
      }

      const entry = await this.store.get(key);
      if (!entry || now >= entry.resetTime) {
        const resetTime = now + this.config.windowMs;
        await this.store.set(key, { count: 1, resetTime });
        return this.buildResult(1, resetTime, now);
      }

      if (entry.count >= this.config.maxRequests) {
        return this.buildResult(entry.count + 1, entry.resetTime, now);
      }

      const nextCount = entry.count + 1;
      await this.store.set(key, { count: nextCount, resetTime: entry.resetTime });
      return this.buildResult(nextCount, entry.resetTime, now);
    } catch {
      // Fallback to in-memory store if external store is unreachable
      return this.checkInMemory(this.memoryFallback, key);
    }
  }

  reset() {
    this.memoryFallback.clear();
    if (this.store instanceof MemoryStore) {
      this.store.clear();
    }
  }
}

// ---------------------------------------------------------------------------
// Pre-configured instances
// ---------------------------------------------------------------------------

/** Default: 100 requests per minute */
const defaultRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000,
  prefix: "api",
});

/** Auth endpoints: 10 requests per minute */
const authRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000,
  prefix: "auth",
});

/** Password reset: 3 per hour */
const passwordResetRateLimiter = new RateLimiter({
  maxRequests: 3,
  windowMs: 60 * 60 * 1000,
  prefix: "pwreset",
});

export {
  RateLimiter,
  MemoryStore,
  defaultRateLimiter,
  authRateLimiter,
  passwordResetRateLimiter,
};
