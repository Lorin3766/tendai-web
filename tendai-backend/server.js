import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import talkRoutes, { handleChatRequest } from './routes/talk.js';
import feedAdviceRoutes from './routes/feed-advice.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file in the backend directory
const envPath = join(__dirname, '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn('⚠️  Warning: Could not load .env file:', result.error.message);
  console.warn('   Make sure .env file exists in tendai-backend directory');
} else {
  console.log('✅ Environment variables loaded from .env');
}

// GOOGLE_API_KEY: server still binds so / and /health work; Talk fails until key is set
if (!process.env.GOOGLE_API_KEY || !String(process.env.GOOGLE_API_KEY).trim()) {
  console.warn('⚠️  GOOGLE_API_KEY is missing or empty — Brain is online but /api/talk will error until you set it in tendai-backend/.env');
} else {
  const key = process.env.GOOGLE_API_KEY;
  const maskedKey = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '***';
  console.log(`✅ GOOGLE_API_KEY is set (${maskedKey})`);
}

const app = express();
const PORT = process.env.PORT || 3001;

/** Required dev origins (Live Server + serve PWA) — plus other local ports below */
const CORS_ALLOW = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (CORS_ALLOW.has(origin)) return callback(null, true);
      try {
        const u = new URL(origin);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          return callback(null, true);
        }
      } catch (_) {}
      if (process.env.NODE_ENV === 'production') return callback(null, false);
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  })
);

// Explicit CORS headers for Live Server preflight reliability (127.0.0.1:5500).
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === 'http://127.0.0.1:5500' || origin === 'http://localhost:5500') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  next();
});

app.options('*', cors());

app.use(express.json());

// Resilience: malformed JSON should return 400 without crashing process.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Malformed JSON payload',
    });
  }
  return next(err);
});

// Browser sanity check — if this fails, nothing is listening on PORT (start the Brain)
app.get('/', (req, res) => {
  res.type('text/plain').send('BRAIN ONLINE');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tendai-backend' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'tendai-backend', api: true });
});

// API routes
app.use('/api', talkRoutes);
app.use('/api', feedAdviceRoutes);

// Also support /chat directly (without /api prefix) for compatibility
app.post('/chat', handleChatRequest);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server (listen on all interfaces so 127.0.0.1 and localhost both resolve)
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 Obrium Backend server started successfully!');
  console.log(`   Brain (relay) on: http://127.0.0.1:${PORT}  and  http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   API endpoint: http://localhost:${PORT}/api/talk`);
  console.log(`   Feed advice: http://localhost:${PORT}/api/feed-advice`);
  console.log(`   Root probe: http://127.0.0.1:${PORT}/  → should show BRAIN ONLINE`);
  console.log(`   CORS: allows http://127.0.0.1:5500 and http://localhost:3000 (and other localhost origins)\n`);
});

