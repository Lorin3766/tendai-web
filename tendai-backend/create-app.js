import express from 'express';
import { corsMiddleware } from './lib/cors.js';
import { createRateLimitMiddleware } from './lib/rate-limit.js';
import { relayConfig } from './lib/config.js';
import { RELAY_CODES, sendRelayError, logRelay } from './lib/errors.js';
import talkRoutes, { handleChatRequest, setTalkDeps } from './routes/talk.js';
import feedAdviceRoutes, { setFeedAdviceDeps } from './routes/feed-advice.js';

/**
 * @param {{
 *   sendToModel?: Function,
 *   generateJsonText?: Function,
 *   getGoogleGenAI?: Function,
 *   clock?: () => number,
 * }} [deps]
 */
export function createApp(deps = {}) {
  if (deps.sendToModel || deps.generateJsonText || deps.getGoogleGenAI) {
    setTalkDeps({ sendToModel: deps.sendToModel });
    setFeedAdviceDeps({
      generateJsonText: deps.generateJsonText,
      getGoogleGenAI: deps.getGoogleGenAI,
    });
  }

  const app = express();
  const cfg = relayConfig();

  // So req.ip (and the per-IP rate limit) sees the real client behind Render/Cloudflare.
  if (cfg.trustProxy !== false) {
    app.set('trust proxy', cfg.trustProxy);
  }

  app.use(corsMiddleware());
  app.use(createRateLimitMiddleware(deps.clock));
  app.use(
    express.json({
      limit: cfg.maxBodyBytes,
      verify: (req, _res, buf) => {
        req.rawBodyBytes = buf?.length || 0;
      },
    }),
  );

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return sendRelayError(res, 400, RELAY_CODES.BAD_REQUEST, 'Malformed JSON payload');
    }
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return sendRelayError(res, 413, RELAY_CODES.PAYLOAD_TOO_LARGE, 'Request body is too large');
    }
    return next(err);
  });

  app.get('/', (_req, res) => {
    res.type('text/plain').send('BRAIN ONLINE');
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'tendai-backend' });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'tendai-backend', api: true });
  });

  app.use('/api', talkRoutes);
  app.use('/api', feedAdviceRoutes);
  app.post('/chat', handleChatRequest);

  app.use((err, _req, res, _next) => {
    logRelay('error', { status: 500, name: err?.name || 'Error' });
    sendRelayError(res, 500, 'internal_error', 'Something went wrong');
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
