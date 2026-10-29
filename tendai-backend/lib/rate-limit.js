import { relayConfig } from './config.js';
import { BUSY_MESSAGE, RELAY_CODES, sendRelayError, logRelay } from './errors.js';

/** Prefer Express req.ip (honors trust proxy). Never read X-Forwarded-For by hand. */
export function clientIp(req) {
  if (req.ip) return String(req.ip);
  return req.socket?.remoteAddress || 'unknown';
}

function utcDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * In-memory per-IP sliding window + global UTC-day cap.
 * @returns {import('express').RequestHandler}
 */
export function createRateLimitMiddleware(clock = () => Date.now()) {
  const hits = new Map(); // ip -> number[]
  let dayKey = utcDayKey(clock());
  let dayCount = 0;

  return function rateLimit(req, res, next) {
    if (req.method === 'OPTIONS' || req.path === '/health' || req.path === '/api/health' || req.path === '/') {
      return next();
    }
    const cfg = relayConfig();
    const now = clock();
    const today = utcDayKey(now);
    if (today !== dayKey) {
      dayKey = today;
      dayCount = 0;
    }
    if (dayCount >= cfg.dailyGlobalCap) {
      logRelay('rate_limit', { code: RELAY_CODES.DAILY_CAP, status: 429 });
      return sendRelayError(res, 429, RELAY_CODES.DAILY_CAP, BUSY_MESSAGE);
    }

    const ip = clientIp(req);
    const windowStart = now - cfg.rateLimitWindowMs;
    const prev = hits.get(ip) || [];
    const recent = prev.filter((t) => t > windowStart);
    if (recent.length >= cfg.rateLimitPerIp) {
      hits.set(ip, recent);
      logRelay('rate_limit', { code: RELAY_CODES.RATE_LIMITED, status: 429 });
      return sendRelayError(res, 429, RELAY_CODES.RATE_LIMITED, BUSY_MESSAGE);
    }
    recent.push(now);
    hits.set(ip, recent);
    dayCount += 1;
    return next();
  };
}

/** Test helper: wipe counters between cases. */
export function __resetRateLimitForTests() {
  /* recreated per createRateLimitMiddleware call */
}
