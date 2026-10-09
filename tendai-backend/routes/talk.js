import express from 'express';
import { sendToModel } from '../services/geminiClient.js';

const router = express.Router();

/**
 * Extract user profile from request body. Supports userProfile object or profileContext string.
 * @param {Object} body - req.body
 * @returns {{ userProfile: Object, additionalContext: string }}
 */
function extractUserData(body) {
  const userProfile = body.userProfile && typeof body.userProfile === 'object'
    ? {
        name: body.userProfile.name,
        age: body.userProfile.age,
        location: body.userProfile.location,
        goals: body.userProfile.goals,
        wantFromObrium: body.userProfile.wantFromObrium,
        motivationLevel: body.userProfile.motivationLevel,
        diet: body.userProfile.diet,
        habits: body.userProfile.habits
      }
    : null;

  const additionalContext = body.profileContext && typeof body.profileContext === 'string' && body.profileContext.trim()
    ? body.profileContext.trim()
    : '';

  return { userProfile, additionalContext };
}

/**
 * Optional structured app snapshot for context injection (extensible).
 * Accepts `system_state` on POST /api/talk when body.system_state is a non-null plain object.
 * @param {Object} body - req.body
 * @returns {Object|null}
 */
function extractSystemState(body) {
  const raw = body && body.system_state;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  return raw;
}

/** Ensure the client receives plain assistant text (regex-friendly for Vitamin/Magnesium, etc.). */
function normalizeTalkReply(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const fm = s.match(fence);
  if (fm) s = fm[1].trim();
  if (s.startsWith('{') && s.endsWith('}')) {
    try {
      const o = JSON.parse(s);
      const inner = o.reply ?? o.message ?? o.text ?? o.content ?? o.answer;
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
    } catch (_) {
      /* keep s */
    }
  }
  return s.trim();
}

// Handler function for chat requests
export async function handleChatRequest(req, res) {
  try {
    const { message } = req.body;
    const { userProfile, additionalContext } = extractUserData(req.body);
    const systemState = extractSystemState(req.body);

    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'Message is required and must be a non-empty string'
      });
    }

    // Limit message length
    if (message.length > 2000) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'Message is too long (max 2000 characters)'
      });
    }

    const raw = await sendToModel(message.trim(), {
      userProfile,
      additionalContext,
      ...(systemState ? { systemState } : {}),
    });
    const reply = normalizeTalkReply(raw);

    // Ensure we always return a valid response
    if (!reply || typeof reply !== 'string') {
      console.error('Invalid reply from Gemini:', raw);
      return res.status(500).json({
        error: 'Invalid response',
        message: 'Received invalid response from AI service'
      });
    }

    res.json({ reply });
  } catch (error) {
    console.error('Error processing chat request:', error);

    const msg = error && error.message ? String(error.message) : '';
    if (msg.includes('GOOGLE_API_KEY')) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'AI is not configured: set GOOGLE_API_KEY in tendai-backend/.env and restart the Brain.',
      });
    }

    // Handle other errors
    res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'Failed to process your message'
    });
  }
}

// POST /api/talk - Send message to LLM
router.post('/talk', handleChatRequest);

// POST /api/chat - Alias for /api/talk (for compatibility)
router.post('/chat', handleChatRequest);

export default router;

