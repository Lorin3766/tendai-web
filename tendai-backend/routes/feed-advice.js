import express from 'express';
import { getGoogleGenAI, generateJsonText } from '../services/geminiClient.js';

const router = express.Router();

// Default fallback texts (sent with `fallback: true`; the app does not display them as advice)
const DEFAULT_TEXTS = {
  quickAdvice: 'Aim for 7–8h sleep tonight.',
  nutritionInsight: 'Add protein to breakfast for a steadier morning.',
  tip: 'Obrium will show helpful notes here later.'
};

// gemini-2.5-flash counts internal reasoning against maxOutputTokens, before any JSON is written.
const FEED_ADVICE_MAX_OUTPUT_TOKENS = 2048;

function fallback(reason) {
  return { ...DEFAULT_TEXTS, fallback: true, reason };
}

function keysOf(obj) {
  return Object.keys(obj).filter((k) => obj[k] !== undefined);
}

/**
 * Generate AI advice for Feed blocks
 * @param {Object} profileState - User profile data (only fields the user provided)
 * @param {Object} dayState - Today's logged values (only fields the user logged)
 * @returns {Promise<Object>} - Structured advice texts, or defaults with `fallback: true`
 */
async function generateFeedAdvice(profileState, dayState) {
  try {
    if (!getGoogleGenAI()) {
      console.warn('⚠️ [FEED-ADVICE] GOOGLE_API_KEY missing — returning fallback');
      return fallback('api key missing');
    }

    const context = {
      profile: {
        age: profileState.age,
        goals: profileState.goals,
        diet: profileState.diet,
        habits: profileState.habits
      },
      day: {
        stepsToday: dayState.stepsToday,
        sleepLastNight: dayState.sleepLastNight,
        hydrationLogged: dayState.hydrationLogged,
        moodToday: dayState.moodToday
      }
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

    console.log('📤 [FEED-ADVICE] Sending request to Gemini');
    console.log('   profile fields:', keysOf(context.profile).join(', ') || 'none');
    console.log('   day fields:', keysOf(context.day).join(', ') || 'none');

    const reply = await generateJsonText(systemPrompt, userPrompt, FEED_ADVICE_MAX_OUTPUT_TOKENS);

    if (!reply) {
      console.error('❌ [FEED-ADVICE] Empty reply from Gemini — returning fallback');
      return fallback('empty reply');
    }

    let parsed;
    try {
      parsed = JSON.parse(reply);
    } catch (parseError) {
      console.error('❌ [FEED-ADVICE] Could not parse Gemini reply as JSON — returning fallback:', parseError.message);
      console.error(`   Raw reply (${reply.length} chars):`, reply);
      return fallback('unparseable reply');
    }

    if (!parsed || typeof parsed.quickAdvice !== 'string' || typeof parsed.nutritionInsight !== 'string' ||
        !parsed.quickAdvice.trim() || !parsed.nutritionInsight.trim()) {
      console.error('❌ [FEED-ADVICE] Gemini JSON missing quickAdvice/nutritionInsight — returning fallback. Keys:', Object.keys(parsed || {}));
      return fallback('incomplete reply');
    }

    const result = {
      quickAdvice: parsed.quickAdvice.trim(),
      nutritionInsight: parsed.nutritionInsight.trim(),
      tip: typeof parsed.tip === 'string' && parsed.tip.trim() ? parsed.tip.trim() : ''
    };

    // Ensure texts are not too long
    Object.keys(result).forEach(key => {
      if (result[key].length > 150) {
        result[key] = result[key].substring(0, 147) + '...';
      }
    });

    console.log('✅ [FEED-ADVICE] Parsed Gemini reply');
    return result;
  } catch (error) {
    console.error('❌ [FEED-ADVICE] Error generating feed advice — returning fallback:', error.message);
    return fallback('gemini error');
  }
}

/**
 * Handler for feed advice requests
 */
export async function handleFeedAdviceRequest(req, res) {
  try {
    const { profileState, dayState } = req.body;

    console.log('📥 [FEED-ADVICE] Received request');

    // Validate input
    if (!profileState || !dayState) {
      console.error('❌ [FEED-ADVICE] Missing required data');
      return res.status(400).json({
        error: 'Invalid request',
        message: 'profileState and dayState are required',
        ...fallback('invalid request')
      });
    }

    const advice = await generateFeedAdvice(profileState, dayState);
    if (advice.fallback) {
      console.warn('⚠️ [FEED-ADVICE] Responding with fallback:', advice.reason);
    }
    res.json(advice);
  } catch (error) {
    console.error('❌ [FEED-ADVICE] Error processing request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'Failed to generate advice',
      ...fallback('server error')
    });
  }
}

// POST /api/feed-advice - Get AI-generated feed advice
router.post('/feed-advice', handleFeedAdviceRequest);

export default router;
