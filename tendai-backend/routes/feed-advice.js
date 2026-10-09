import express from 'express';
import { getGoogleGenAI, generateJsonText } from '../services/geminiClient.js';

const router = express.Router();

// Default fallback texts
const DEFAULT_TEXTS = {
  quickAdvice: 'Aim for 7–8h sleep tonight.',
  nutritionInsight: 'Add protein to breakfast for a steadier morning.',
  tip: 'Obrium will show helpful notes here later.'
};

/**
 * Generate AI advice for Feed blocks
 * @param {Object} profileState - User profile data
 * @param {Object} dayState - Current day state (sleep, hydration, mood)
 * @returns {Promise<Object>} - Structured advice texts
 */
async function generateFeedAdvice(profileState, dayState) {
  try {
    if (!getGoogleGenAI()) {
      console.warn('⚠️ [FEED-ADVICE] GOOGLE_API_KEY missing — using defaults');
      return DEFAULT_TEXTS;
    }

    // Build context from profile and day state
    const context = {
      profile: {
        age: profileState.age,
        gender: profileState.gender,
        sleepHours: profileState.sleepHours,
        sleepQuality: profileState.sleepQuality,
        stressLevel: profileState.stressLevel,
        foodQuality: profileState.foodQuality,
        activeDays: profileState.activeDays,
        stepCategory: profileState.stepCategory,
        bodyGoal: profileState.bodyGoal,
        healthGoal: profileState.healthGoal,
        mindGoal: profileState.mindGoal
      },
      day: {
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
- Never state, estimate, or imply a value for a missing field (e.g. do not mention hours of sleep, glasses of water, or mood unless that field is present).
- If little or nothing is provided, give general, non-personalized advice and do not claim it is based on their data.

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
1. quickAdvice: A quick actionable tip for today (focus on sleep, energy, or daily habits)
2. nutritionInsight: A specific nutrition recommendation based on their profile and day state
3. tip: A helpful wellbeing tip for the right sidebar

Return only the JSON object with these three keys.`;

    console.log('📤 [FEED-ADVICE] Sending request to Gemini...');
    console.log('   Context profile:', JSON.stringify(context.profile, null, 2));
    console.log('   Context day:', JSON.stringify(context.day, null, 2));

    const reply = await generateJsonText(systemPrompt, userPrompt, 200);

    if (!reply) {
      console.error('❌ [FEED-ADVICE] No reply from Gemini');
      return DEFAULT_TEXTS;
    }

    console.log('📥 [FEED-ADVICE] Raw Gemini reply:', reply.substring(0, 200) + (reply.length > 200 ? '...' : ''));

    try {
      const parsed = JSON.parse(reply);
      
      // Validate and sanitize response
      const result = {
        quickAdvice: parsed.quickAdvice || DEFAULT_TEXTS.quickAdvice,
        nutritionInsight: parsed.nutritionInsight || DEFAULT_TEXTS.nutritionInsight,
        tip: parsed.tip || DEFAULT_TEXTS.tip
      };

      // Ensure texts are not too long
      Object.keys(result).forEach(key => {
        if (result[key].length > 150) {
          result[key] = result[key].substring(0, 147) + '...';
        }
      });

      console.log('✅ [FEED-ADVICE] Received response from OpenAI');
      console.log('   Parsed result:', JSON.stringify(result, null, 2));
      return result;
    } catch (parseError) {
      console.error('❌ [FEED-ADVICE] Error parsing Gemini response:', parseError);
      console.error('   Raw reply:', reply);
      return DEFAULT_TEXTS;
    }
  } catch (error) {
    console.error('❌ [FEED-ADVICE] Error generating feed advice:', error.message);
    console.error('   Error details:', error);
    return DEFAULT_TEXTS;
  }
}

/**
 * Handler for feed advice requests
 */
export async function handleFeedAdviceRequest(req, res) {
  try {
    const { profileState, dayState } = req.body;

    // Логирование входящих данных
    console.log('📥 [FEED-ADVICE] Received request');
    console.log('   profileState keys:', Object.keys(profileState || {}));
    console.log('   dayState:', JSON.stringify(dayState, null, 2));

    // Validate input
    if (!profileState || !dayState) {
      console.error('❌ [FEED-ADVICE] Missing required data');
      return res.status(400).json({
        error: 'Invalid request',
        message: 'profileState and dayState are required',
        ...DEFAULT_TEXTS
      });
    }

    // Generate advice
    const advice = await generateFeedAdvice(profileState, dayState);

    // Логирование результата
    console.log('✅ [FEED-ADVICE] Returning advice:');
    console.log('   quickAdvice:', advice.quickAdvice);
    console.log('   nutritionInsight:', advice.nutritionInsight);
    console.log('   tip:', advice.tip);

    res.json(advice);
  } catch (error) {
    console.error('❌ [FEED-ADVICE] Error processing request:', error);
    console.error('   Error stack:', error.stack);
    
    // Return default texts on error
    const fallbackResponse = {
      error: 'Internal server error',
      message: error.message || 'Failed to generate advice',
      ...DEFAULT_TEXTS
    };
    console.log('🔄 [FEED-ADVICE] Returning fallback:', fallbackResponse);
    res.status(500).json(fallbackResponse);
  }
}

// POST /api/feed-advice - Get AI-generated feed advice
router.post('/feed-advice', handleFeedAdviceRequest);

export default router;

