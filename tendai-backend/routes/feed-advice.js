import express from 'express';
import {
  getGoogleGenAI as defaultGetGoogleGenAI,
  generateJsonText as defaultGenerateJsonText,
} from '../services/geminiClient.js';
import { relayConfig } from '../lib/config.js';
import { validateFeedAdviceBody, rejectInvalid } from '../lib/validate.js';
import { BUSY_MESSAGE, RELAY_CODES, sendRelayError, logRelay } from '../lib/errors.js';

const router = express.Router();

const DEFAULT_TEXTS = {
  quickAdvice: 'Aim for 7–8h sleep tonight.',
  nutritionInsight: 'Add protein to breakfast for a steadier morning.',
  tip: 'Obrium will show helpful notes here later.',
};

let _getGoogleGenAI = defaultGetGoogleGenAI;
let _generateJsonText = defaultGenerateJsonText;

export function setFeedAdviceDeps({ getGoogleGenAI, generateJsonText } = {}) {
  if (typeof getGoogleGenAI === 'function') _getGoogleGenAI = getGoogleGenAI;
  if (typeof generateJsonText === 'function') _generateJsonText = generateJsonText;
}

function fallback(reason) {
  return { ...DEFAULT_TEXTS, fallback: true, reason };
}

function keysOf(obj) {
  return Object.keys(obj || {}).filter((k) => obj[k] !== undefined);
}

async function generateFeedAdvice(profileState, dayState) {
  try {
    if (!_getGoogleGenAI()) {
      logRelay('feed_advice', { status: 'fallback', reason: 'not_configured' });
      return fallback('api key missing');
    }

    const context = {
      profile: {
        age: profileState.age,
        goals: profileState.goals,
        diet: profileState.diet,
        habits: profileState.habits,
      },
      day: {
        stepsToday: dayState.stepsToday,
        sleepLastNight: dayState.sleepLastNight,
        hydrationLogged: dayState.hydrationLogged,
        moodToday: dayState.moodToday,
      },
    };

    const systemPrompt = `You are Obrium, a personal wellbeing assistant. Never refer to yourself as TendAI, Serron, or Seregin OS. Generate personalized, concise advice based on user profile and current day state.

Your responses must be:
- Concise (1 short sentence, max 15 words)
- Actionable and specific
- Warm and supportive
- Based on the provided context

DATA INTEGRITY (never break this):
- Only the fields present in the user profile and day state are known. A missing field means the user has not provided it.
- Never state, estimate, or imply a value for a missing field (e.g. do not mention steps, hours of sleep, glasses of water, or mood unless that field is present).
- If little or nothing is provided, give general, non-personalized advice and do not claim it is based on their data.
- hydrationLogged is a count of glasses of water logged today.

Return ONLY a valid JSON object with these exact keys:
{
  "quickAdvice": "one short actionable advice",
  "nutritionInsight": "one short nutrition tip",
  "tip": "one short helpful tip"
}

Do not include any explanations, markdown, or additional text. Only the JSON object.`;

    const userPrompt = `User profile: ${JSON.stringify(context.profile)}
Current day state: ${JSON.stringify(context.day)}
(Fields not listed above were not provided by the user.)

Generate personalized advice for:
1. quickAdvice: A quick actionable tip for today (focus on sleep, energy, activity, or daily habits)
2. nutritionInsight: A specific nutrition recommendation based on their profile and day state
3. tip: A short general wellbeing tip

Return only the JSON object with these three keys.`;

    logRelay('feed_advice_request', {
      profileFields: keysOf(context.profile).length,
      dayFields: keysOf(context.day).length,
    });

    const cfg = relayConfig();
    const reply = await _generateJsonText(systemPrompt, userPrompt, cfg.feedAdviceMaxOutputTokens);

    if (!reply) {
      logRelay('feed_advice', { status: 'fallback', reason: 'empty_reply' });
      return fallback('empty reply');
    }

    let parsed;
    try {
      parsed = JSON.parse(reply);
    } catch (_) {
      logRelay('feed_advice', { status: 'fallback', reason: 'unparseable', replyChars: reply.length });
      return fallback('unparseable reply');
    }

    if (
      !parsed ||
      typeof parsed.quickAdvice !== 'string' ||
      typeof parsed.nutritionInsight !== 'string' ||
      !parsed.quickAdvice.trim() ||
      !parsed.nutritionInsight.trim()
    ) {
      logRelay('feed_advice', { status: 'fallback', reason: 'incomplete' });
      return fallback('incomplete reply');
    }

    const result = {
      quickAdvice: parsed.quickAdvice.trim(),
      nutritionInsight: parsed.nutritionInsight.trim(),
      tip: typeof parsed.tip === 'string' && parsed.tip.trim() ? parsed.tip.trim() : '',
    };

    Object.keys(result).forEach((key) => {
      if (result[key].length > 150) {
        result[key] = result[key].substring(0, 147) + '...';
      }
    });

    logRelay('feed_advice', { status: 'ok' });
    return result;
  } catch (error) {
    const msg = error && error.message ? String(error.message) : '';
    if (/quota|rate.?limit|resource.?exhausted|429/i.test(msg)) {
      const err = new Error('gemini quota');
      err.code = RELAY_CODES.GEMINI_QUOTA;
      throw err;
    }
    logRelay('feed_advice', { status: 'fallback', reason: 'gemini_error', name: error?.name || 'Error' });
    return fallback('gemini error');
  }
}

export async function handleFeedAdviceRequest(req, res) {
  const started = Date.now();
  try {
    const checked = validateFeedAdviceBody(req.body || {});
    if (!checked.ok) return rejectInvalid(res, checked);

    const { profileState, dayState } = req.body;
    if (!profileState || !dayState) {
      return sendRelayError(res, 400, RELAY_CODES.BAD_REQUEST, 'profileState and dayState are required');
    }

    const advice = await generateFeedAdvice(profileState, dayState);
    logRelay('feed_advice_http', { status: 200, ms: Date.now() - started, fallback: !!advice.fallback });
    res.json(advice);
  } catch (error) {
    if (error?.code === RELAY_CODES.GEMINI_QUOTA) {
      logRelay('feed_advice_http', { status: 429, code: RELAY_CODES.GEMINI_QUOTA, ms: Date.now() - started });
      return sendRelayError(res, 429, RELAY_CODES.GEMINI_QUOTA, BUSY_MESSAGE);
    }
    logRelay('feed_advice_http', { status: 500, ms: Date.now() - started, name: error?.name || 'Error' });
    return sendRelayError(res, 500, 'internal_error', BUSY_MESSAGE);
  }
}

router.post('/feed-advice', handleFeedAdviceRequest);

export default router;
