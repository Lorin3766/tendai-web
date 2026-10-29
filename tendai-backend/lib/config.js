/** Env-backed relay settings. Secrets only from process.env. */

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

export function allowedOrigins() {
  const raw = process.env.OBRIUM_ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Express "trust proxy" setting for req.ip behind Render/Cloudflare.
 * unset / 0 / false → do not trust X-Forwarded-For (local default).
 * 1 / true → trust one hop (typical single reverse proxy).
 * N (integer) → trust N hops.
 */
export function trustProxySetting() {
  const raw = process.env.OBRIUM_TRUST_PROXY;
  if (raw == null || String(raw).trim() === '') return false;
  const v = String(raw).trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  if (v === 'true' || v === 'yes' || v === 'on') return 1;
  const n = Number.parseInt(v, 10);
  if (Number.isFinite(n) && n >= 0) return n === 0 ? false : n;
  return false;
}

export function relayConfig() {
  return {
    port: intEnv('PORT', 3001),
    trustProxy: trustProxySetting(),
    geminiModel: (process.env.GEMINI_MODEL && String(process.env.GEMINI_MODEL).trim()) || 'gemini-2.5-flash',
    maxOutputTokens: intEnv('GEMINI_MAX_OUTPUT_TOKENS', 640),
    feedAdviceMaxOutputTokens: intEnv('GEMINI_FEED_MAX_OUTPUT_TOKENS', 2048),
    upstreamTimeoutMs: intEnv('OBRIUM_UPSTREAM_TIMEOUT_MS', 25000),
    maxBodyBytes: intEnv('OBRIUM_MAX_BODY_BYTES', 32 * 1024),
    maxMessageLength: intEnv('OBRIUM_MAX_MESSAGE_LENGTH', 2000),
    rateLimitPerIp: intEnv('OBRIUM_RATE_LIMIT_PER_IP', 30),
    rateLimitWindowMs: intEnv('OBRIUM_RATE_LIMIT_WINDOW_MS', 60 * 1000),
    dailyGlobalCap: intEnv('OBRIUM_DAILY_REQUEST_CAP', 2000),
  };
}
