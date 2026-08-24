import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildSystemPrompt } from './talkSystemPrompt.js';

export { buildSystemPrompt };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// `new GoogleGenerativeAI(key)` uses the SDK default endpoint (no custom URLs). `gemini-1.5-flash` returns 404
// on the API today; use a model from ListModels (e.g. gemini-2.5-flash) via GEMINI_MODEL.
const MODEL =
  (process.env.GEMINI_MODEL && String(process.env.GEMINI_MODEL).trim()) || 'gemini-2.5-flash';

/** Lazy client so HTTP server can start before key is configured. */
let _genAI = null;

export function getGoogleGenAI() {
  const key = process.env.GOOGLE_API_KEY && String(process.env.GOOGLE_API_KEY).trim();
  if (!key) return null;
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(key);
    console.log('✅ Google Generative AI client initialized');
  }
  return _genAI;
}

/**
 * @param {string} userMessage
 * @param {{ userProfile?: Object, additionalContext?: string, systemState?: Object }} [opts]
 * @returns {Promise<string>} Plain assistant text (no markdown wrapper) for client keyword detection.
 */
export async function sendToModel(userMessage, opts) {
  const genAI = getGoogleGenAI();
  if (!genAI) {
    throw new Error('GOOGLE_API_KEY is not set in environment variables');
  }

  const systemPrompt = buildSystemPrompt(opts || {});

  console.log('📤 Sending message to Gemini...');

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 640,
    },
  });

  const result = await model.generateContent(userMessage);
  const raw = result.response.text();
  const reply = raw != null ? String(raw).trim() : '';

  if (!reply) {
    console.error('❌ No text in Gemini response:', result?.response);
    throw new Error('No response from Gemini');
  }

  console.log('✅ Received reply from Gemini (length:', reply.length, 'chars)');
  return reply;
}

/**
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} [maxOutputTokens]
 * @returns {Promise<string|null>} Raw JSON string from model, or null if API key missing.
 */
export async function generateJsonText(systemPrompt, userPrompt, maxOutputTokens = 200) {
  const genAI = getGoogleGenAI();
  if (!genAI) return null;

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens,
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  return text != null ? String(text).trim() : null;
}
