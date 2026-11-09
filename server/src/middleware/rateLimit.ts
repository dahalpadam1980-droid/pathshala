import type { RequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';

/** Loose handler typing keeps Express route generics unconstrained. */
type LooseHandler = RequestHandler<any, any, any, any, any>;

/**
 * Simple in-memory sliding-window rate limiter.
 * Used for authentication endpoints to slow credential stuffing.
 * For horizontal production deployments move this to Redis.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(opts: { windowMs: number; max: number; keyPrefix?: string }): LooseHandler {
  const keyPrefix = opts.keyPrefix ?? 'rl';
  return (req, _res, next) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return next(new ApiError(429, `Too many attempts. Try again in ${retryAfter} seconds.`, 'rate_limited'));
    }
    next();
  };
}

/** Periodically clear expired entries so memory stays bounded. */
export function startRateLimitCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }, 60_000).unref();
}
