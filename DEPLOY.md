# Obrium deploy guide (closed beta)

Cursor prepares the app and relay. **You** create the accounts, turn on billing, set secrets, and deploy. Do not put API keys in the git repo.

## Default stack

| Piece | Suggested free start | Better for testers |
| --- | --- | --- |
| Static front-end (`mobile-app/`) | Cloudflare Pages, Netlify, or Vercel | Same |
| Relay (`tendai-backend/`) | Render / Railway / Fly free tier | **Paid always-on** instance |

**Free relay instances sleep.** The first request after idle can take 30–60+ seconds and may look offline. For a handful of testers, use a paid always-on relay.

## What to deploy

### Front-end

- **Root directory:** `mobile-app`
- **Build command:** none (static files)
- **Publish directory:** `mobile-app` (or `.` if the site root is already `mobile-app`)
- Set the relay URL in `index.html`:

```html
<meta name="obrium-backend-url" content="https://YOUR-RELAY.onrender.com" />
```

Optional bearer (only if you later lock the relay):

```html
<meta name="obrium-backend-bearer" content="YOUR_TOKEN" />
```

Or inject `window.OBRIUM_BACKEND_URL` / `window.OBRIUM_BACKEND_BEARER` from the host’s snippet feature.

### Relay

- **Root directory:** `tendai-backend`
- **Start command:** `npm start` (runs `node server.js`)
- **Install:** `npm install`
- Health check path: `/health` (JSON `{ status: 'ok', service: 'tendai-backend' }`)

## Environment variables (relay)

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `GOOGLE_API_KEY` | yes | — | Gemini API key |
| `PORT` | set by host | `3001` | Listen port |
| `NODE_ENV` | yes in prod | — | Set to `production` |
| `OBRIUM_ALLOWED_ORIGINS` | yes in prod | empty | Comma-separated front-end origins, e.g. `https://obrium.pages.dev` |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | Model id |
| `GEMINI_MAX_OUTPUT_TOKENS` | no | `640` | Talk max tokens |
| `GEMINI_FEED_MAX_OUTPUT_TOKENS` | no | `2048` | Feed-advice max tokens |
| `OBRIUM_UPSTREAM_TIMEOUT_MS` | no | `25000` | Gemini call timeout |
| `OBRIUM_MAX_BODY_BYTES` | no | `32768` | Max JSON body |
| `OBRIUM_MAX_MESSAGE_LENGTH` | no | `2000` | Max Talk message length |
| `OBRIUM_RATE_LIMIT_PER_IP` | no | `30` | Requests per IP per window |
| `OBRIUM_RATE_LIMIT_WINDOW_MS` | no | `60000` | Rate-limit window |
| `OBRIUM_DAILY_REQUEST_CAP` | no | `2000` | Global requests per UTC day |

Copy from `tendai-backend/.env.example`. Never commit `.env`.

## HTTPS and domain

1. Deploy the front-end on HTTPS (Pages/Netlify/Vercel do this).
2. Deploy the relay on HTTPS.
3. Put the exact front-end origin(s) in `OBRIUM_ALLOWED_ORIGINS` (scheme + host, no path).
4. Put the relay origin in the front-end meta tag.
5. Add the relay hostname to `mobile-app/_headers` `Content-Security-Policy` `connect-src` (and to `mobile-app/allowed-hosts.json` if you keep that list in sync).

## Rotate the Gemini key

1. Create a new key in Google AI Studio / Cloud.
2. Update `GOOGLE_API_KEY` on the relay host.
3. Restart / redeploy the relay.
4. Disable the old key in Google.
5. Confirm `/health` still returns ok, then run the smoke script with `--chat` once.

## Roll back

- **Front-end:** redeploy the previous commit / deployment in the host UI.
- **Relay:** redeploy the previous commit; keep the same env vars.
- Bump or keep `CACHE_NAME` in `service-worker.js` so clients drop a bad shell (`obrium-shell-v…`).

## Logs

Relay logs are JSON lines with **field names, status codes and durations only** — not message text, profile values, or model replies. On Render/Railway/Fly open the service logs and filter for `"event":"talk_error"` or `"event":"rate_limit"`.

## Smoke test

With both URLs live:

```bash
node scripts/smoke-prod.mjs https://YOUR-FRONTEND https://YOUR-RELAY
```

Optional (uses Gemini quota):

```bash
node scripts/smoke-prod.mjs https://YOUR-FRONTEND https://YOUR-RELAY --chat
```

Local check (dev servers):

```bash
# static: npx http-server mobile-app -p 50490 -s -c-1
# relay:  cd tendai-backend && npm start
node scripts/smoke-prod.mjs http://127.0.0.1:50490 http://127.0.0.1:3001
```

For local smoke, set `NODE_ENV=development` on the relay (or list `http://127.0.0.1:50490` in `OBRIUM_ALLOWED_ORIGINS`).

## Closed beta checklist

- [ ] Billing enabled on the Google project; budget alert set
- [ ] Tell Cursor `billing is on` so free-tier consent / policy copy can be swapped
- [ ] Legal entity name + contact email confirmed in Privacy / Terms
- [ ] Review `content-library-review.md` (36 facts, 26 actions)
- [ ] Remove `noindex` (meta + `_headers` `X-Robots-Tag`) at public launch only
- [ ] Install on your phone and use for a week
