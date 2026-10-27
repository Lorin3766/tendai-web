import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createApp } from './create-app.js';
import { relayConfig, isProduction } from './lib/config.js';
import { logRelay } from './lib/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  logRelay('env_load', { ok: false });
} else {
  logRelay('env_load', { ok: true });
}

if (!process.env.GOOGLE_API_KEY || !String(process.env.GOOGLE_API_KEY).trim()) {
  logRelay('key_status', { configured: false });
} else {
  logRelay('key_status', { configured: true });
}

const cfg = relayConfig();
const app = createApp();

app.listen(cfg.port, '0.0.0.0', () => {
  logRelay('listen', {
    port: cfg.port,
    production: isProduction(),
    service: 'tendai-backend',
  });
});
