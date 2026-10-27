import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildSystemPrompt } from './talkSystemPrompt.js';
import { relayConfig } from '../lib/config.js';
import { logRelay } from '../lib/errors.js';

export { buildSystemPrompt };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

let _genAI = null;

export function getGoogleGenAI() {
  const key = process.env.GOOGLE_API_KEY && String(process.env.GOOGLE_API_KEY).trim();
  if (!key) return null;
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(key);
    logRelay('gemini_client_init', { ok: true });
  }
  return _genAI;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('Upstream timeout');
      err.name = 'UpstreamTimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {string} userMessage
 * @param {{ userProfile?: Object, additionalContext?: string, systemState?: Object }} [opts]
 * @returns {Promise<string>}
 */
export async function sendToModel(userMessage, opts) {
  const genAI = getGoogleGenAI();
  if (!genAI) {
    throw new Error('GOOGLE_API_KEY is not set in environment variables');
  }

  const cfg = relayConfig();
  const systemPrompt = buildSystemPrompt(opts || {});
  const started = Date.now();
  logRelay('gemini_request', { kind: 'talk', model: cfg.geminiModel });

  const model = genAI.getGenerativeModel({
    model: cfg.geminiModel,
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: cfg.maxOutputTokens,
    },
  });

  try {
    const result = await withTimeout(model.generateContent(userMessage), cfg.upstreamTimeoutMs);
    const raw = result.response.text();
    const reply = raw != null ? String(raw).trim() : '';
    if (!reply) {
      logRelay('gemini_empty', { kind: 'talk', ms: Date.now() - started });
      throw new Error('No response from Gemini');
    }
    logRelay('gemini_ok', { kind: 'talk', ms: Date.now() - started, replyChars: reply.length });
    return reply;
  } catch (error) {
    logRelay('gemini_error', {
      kind: 'talk',
      ms: Date.now() - started,
      name: error?.name || 'Error',
      status: error?.status || error?.code || undefined,
    });
    throw error;
  }
}

/**
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} [maxOutputTokens]
 * @returns {Promise<string|null>}
 */
export async function generateJsonText(systemPrompt, userPrompt, maxOutputTokens) {
  const genAI = getGoogleGenAI();
  if (!genAI) return null;

  const cfg = relayConfig();
  const tokens = maxOutputTokens || cfg.feedAdviceMaxOutputTokens;
  const started = Date.now();
  logRelay('gemini_request', { kind: 'json', model: cfg.geminiModel });

  const model = genAI.getGenerativeModel({
    model: cfg.geminiModel,
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: tokens,
      responseMimeType: 'application/json',
    },
  });

  try {
    const result = await withTimeout(model.generateContent(userPrompt), cfg.upstreamTimeoutMs);
    const finishReason = result.response?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      logRelay('gemini_finish', { kind: 'json', finishReason, maxOutputTokens: tokens });
    }
    const text = result.response.text();
    logRelay('gemini_ok', {
      kind: 'json',
      ms: Date.now() - started,
      replyChars: text != null ? String(text).length : 0,
    });
    return text != null ? String(text).trim() : null;
  } catch (error) {
    logRelay('gemini_error', {
      kind: 'json',
      ms: Date.now() - started,
      name: error?.name || 'Error',
      status: error?.status || error?.code || undefined,
    });
    throw error;
  }
}
