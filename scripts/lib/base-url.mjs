/**
 * Base URL of the static PWA server for test/screenshot scripts.
 * OBRIUM_URL wins; legacy SERRON_URL / TENDAI_URL still work but print a one-time warning.
 */
/** Default matches `npm run serve` (mobile-app as web root on 5501). */
const DEFAULT_BASE_URL = 'http://127.0.0.1:5501';

function resolveBaseUrl() {
  if (process.env.OBRIUM_URL) return process.env.OBRIUM_URL;
  for (const legacy of ['SERRON_URL', 'TENDAI_URL']) {
    if (process.env[legacy]) {
      console.warn(`[obrium] ${legacy} is deprecated — set OBRIUM_URL instead.`);
      return process.env[legacy];
    }
  }
  return DEFAULT_BASE_URL;
}

export const baseUrl = resolveBaseUrl();
