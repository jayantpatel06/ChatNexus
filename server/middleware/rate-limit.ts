import { NextFunction, Request, Response } from 'express';

interface RateLimitStore {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting (use Redis in production for multi-instance)
const stores = new Map<string, Map<string, RateLimitStore>>();

interface RateLimitOptions {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  message?: string;      // Custom error message
  keyGenerator?: (req: Request) => string; // Custom key generator
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfterSeconds: number;
}

type RateLimiter = ((req: Request, res: Response, next: NextFunction) => void) & {
  consume: (key: string) => RateLimitResult;
  message: string;
};

function getOrCreateStore(name: string, windowMs: number) {
  if (!stores.has(name)) {
    const store = new Map<string, RateLimitStore>();
    stores.set(name, store);

    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store.entries()) {
        if (now > entry.resetTime) {
          store.delete(key);
        }
      }
    }, windowMs);

    cleanupTimer.unref?.();
  }

  return stores.get(name)!;
}

function consumeRateLimit(
  store: Map<string, RateLimitStore>,
  key: string,
  windowMs: number,
  maxRequests: number,
): RateLimitResult {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + windowMs,
    };
    store.set(key, entry);

    return {
      allowed: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
      resetTime: entry.resetTime,
      retryAfterSeconds: Math.ceil((entry.resetTime - now) / 1000),
    };
  }

  entry.count++;

  return {
    allowed: entry.count <= maxRequests,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    resetTime: entry.resetTime,
    retryAfterSeconds: Math.ceil((entry.resetTime - now) / 1000),
  };
}

/**
 * Create a rate limiter middleware
 */
export function createRateLimiter(name: string, options: RateLimitOptions): RateLimiter {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.ip || req.socket.remoteAddress || 'unknown',
  } = options;

  const store = getOrCreateStore(name, windowMs);

  const limiter = ((req: Request, res: Response, next: NextFunction) => {
    const result = consumeRateLimit(store, keyGenerator(req), windowMs, maxRequests);

    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfterSeconds);
      return res.status(429).json({ message });
    }

    next();
  }) as RateLimiter;

  limiter.consume = (key: string) =>
    consumeRateLimit(store, key, windowMs, maxRequests);
  limiter.message = message;

  return limiter;
}

// Pre-configured rate limiters for common use cases
export const authRateLimiter = createRateLimiter('auth', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,          // 10 attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later',
});

export const guestLoginRateLimiter = createRateLimiter('guest-login', {
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 5,           // 5 guest logins per minute per IP
  message: 'Too many guest login attempts, please wait a moment',
});

export const apiRateLimiter = createRateLimiter('api', {
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 100,         // 100 requests per minute
  message: 'Too many requests, please slow down',
});

export const messageRateLimiter = createRateLimiter('message', {
  windowMs: 1000,           // 1 second
  maxRequests: 10,          // 10 messages per second
  message: 'Sending messages too fast, please slow down',
});
