import { allowedOrigins, isProduction } from './config.js';

function isLoopbackOrigin(origin) {
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch (_) {
    return false;
  }
}

/** Whether this Origin may call the relay. */
export function isOriginAllowed(origin) {
  if (!origin) return true; // same-origin / curl / health probes
  const allow = allowedOrigins();
  if (allow.includes(origin)) return true;
  if (!isProduction() && isLoopbackOrigin(origin)) return true;
  return false;
}

export function corsMiddleware() {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      if (origin && !isOriginAllowed(origin)) {
        return res.status(403).json({ error: 'CORS denied', code: 'cors_denied' });
      }
      return res.status(204).end();
    }
    if (origin && !isOriginAllowed(origin)) {
      return res.status(403).json({ error: 'CORS denied', code: 'cors_denied' });
    }
    return next();
  };
}
