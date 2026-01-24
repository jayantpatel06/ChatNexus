import { Request, Response, NextFunction } from 'express';

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

/**
 * Create a rate limiter middleware
 */
export function createRateLimiter(name: string, options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.ip || req.socket.remoteAddress || 'unknown',
  } = options;

  // Initialize store for this limiter
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  const store = stores.get(name)!;

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetTime) {
        store.delete(key);
      }
    }
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(key, entry);
      return next();
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));
      return res.status(429).json({ message });
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    next();
  };
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
