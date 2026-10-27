import express from 'express';
import { sendToModel as defaultSendToModel } from '../services/geminiClient.js';
import { validateTalkBody, rejectInvalid } from '../lib/validate.js';
import { BUSY_MESSAGE, RELAY_CODES, sendRelayError, logRelay } from '../lib/errors.js';

const router = express.Router();

let _sendToModel = defaultSendToModel;

export function setTalkDeps({ sendToModel } = {}) {
  if (typeof sendToModel === 'function') _sendToModel = sendToModel;
}

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

function extractSystemState(body) {
  const raw = body && body.system_state;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  return raw;
}

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

function classifyUpstreamError(error) {
  const msg = error && error.message ? String(error.message) : '';
  const name = error && error.name ? String(error.name) : '';
  if (name === 'UpstreamTimeoutError' || /timeout/i.test(msg)) {
    return { status: 503, code: RELAY_CODES.UPSTREAM_TIMEOUT, message: BUSY_MESSAGE };
  }
  if (/GOOGLE_API_KEY/i.test(msg)) {
    return { status: 503, code: RELAY_CODES.NOT_CONFIGURED, message: BUSY_MESSAGE };
  }
  if (/quota|rate.?limit|resource.?exhausted|429/i.test(msg)) {
    return { status: 429, code: RELAY_CODES.GEMINI_QUOTA, message: BUSY_MESSAGE };
  }
  return { status: 500, code: 'upstream_error', message: BUSY_MESSAGE };
}

export async function handleChatRequest(req, res) {
  const started = Date.now();
  try {
    const checked = validateTalkBody(req.body || {});
    if (!checked.ok) return rejectInvalid(res, checked);

    const { message } = req.body;
    const { userProfile, additionalContext } = extractUserData(req.body);
    const systemState = extractSystemState(req.body);

    const raw = await _sendToModel(message.trim(), {
      userProfile,
      additionalContext,
      ...(systemState ? { systemState } : {}),
    });
    const reply = normalizeTalkReply(raw);

    if (!reply || typeof reply !== 'string') {
      logRelay('talk_invalid_reply', { status: 500, ms: Date.now() - started });
      return sendRelayError(res, 500, 'invalid_response', BUSY_MESSAGE);
    }

    logRelay('talk_ok', { status: 200, ms: Date.now() - started, replyChars: reply.length });
    res.json({ reply });
  } catch (error) {
    const mapped = classifyUpstreamError(error);
    logRelay('talk_error', {
      status: mapped.status,
      code: mapped.code,
      ms: Date.now() - started,
      name: error?.name || 'Error',
    });
    return sendRelayError(res, mapped.status, mapped.code, mapped.message);
  }
}

router.post('/talk', handleChatRequest);
router.post('/chat', handleChatRequest);

export default router;
