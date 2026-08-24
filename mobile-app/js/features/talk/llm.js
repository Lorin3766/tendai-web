// Serron Mobile — LLM Integration
// @owner: talk
// @role: utils

import { getCommonLedger } from '../human-os/common-ledger.js';
import { getUserMemory } from './user-memory.js';
import { fetchBackend, publishBackendStatus } from '../../core/backend-fetch.js';
import { NetworkController } from '../../infrastructure/network-controller.js';
import { saveMetrics, getMetricsByDate } from '../../core/biometrics-db.js';

/**
 * Default relay URL. Port 3001 avoids clashing with repo `npm start`, which serves
 * the PWA on http://localhost:3000 (see root package.json).
 * Override anytime: window.SERRON_BACKEND_URL = 'http://127.0.0.1:3001'
 * (legacy alias: window.TENDAI_BACKEND_URL)
 *
 * OpenAI keys belong only in tendai-backend/.env (OPENAI_API_KEY). The browser does not
 * send the OpenAI secret. Optional: window.SERRON_BACKEND_BEARER for relay auth if your proxy requires it.
 */
const DEFAULT_BACKEND_URL = 'http://localhost:3001';
const TALK_FETCH_TIMEOUT_MS = 15000;
const TALK_FETCH_MAX_RETRIES = 3;
const TALK_FETCH_RETRY_DELAYS = [1000, 2000, 3000];

/** True when relay base is loopback — always attempt at least one backend fetch (wake / Wi-Fi recovery). */
function isLocalhostRelayBackend(baseUrl) {
  const s = String(baseUrl || '').trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return /^(localhost|127\.0\.0\.1)$/i.test(u.hostname);
  } catch (_) {
    return /:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(s);
  }
}

function setServerStatus(status) {
  publishBackendStatus(status);
}

function setOfflineBrainIndicator(active) {
  if (typeof window === 'undefined') return;
  window.__serronOfflineBrain = active === true;
  const el = document.getElementById('talkRuntimeIndicator');
  if (!el) return;
  el.classList.toggle('is-active', active === true);
  el.textContent = active === true ? '☁︎ LOCAL' : '';
}

/** Local-mode agent ids (must match `MOCK_AGENT_REGISTRY` in agent-reports-feed.js). */
const LOCAL_MOCK_AGENT_IDS = {
  sleep: 'AGT-01-SLEEP',
  move: 'AGT-11-MOVE',
};

/**
 * @param {string} agentId
 * @param {Record<string, unknown>} payload
 */
function dispatchTendaiUpdateAgent(agentId, payload) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(
    new CustomEvent('Tendai:UpdateAgent', {
      detail: { agentId, ...payload },
    }),
  );
}

/**
 * Mock LLM for offline Talk→Feed: multi-metric NLP (sleep + steps).
 * @param {string} userInput
 * @returns {Array<{ type: string, value: string }>}
 */
function dispatchLocalMockUpdateAgentFromInput(userInput) {
  if (typeof document === 'undefined') return [];
  const raw = String(userInput || '').trim();
  if (!raw) return [];

  const sleepMatch = raw.match(
    /(?:спал|сон|sleep)[^\d]*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)[^\d]*(?:часа|часов|ч|hours|h)/i,
  );
  const stepsMatch = raw.match(
    /(?:прошел|шаг|шагов|steps)[^\d]*(\d+)|(\d+)[^\d]*(?:шаг|шагов|steps)/i,
  );

  /** @type {Array<{ type: string, value: string }>} */
  const dispatched = [];

  if (sleepMatch) {
    const sleepVal = sleepMatch[1] || sleepMatch[2];
    if (sleepVal) {
      console.log('[LOCAL MODE] Mock parser: sleep =', sleepVal);
      dispatchTendaiUpdateAgent(LOCAL_MOCK_AGENT_IDS.sleep, {
        value: sleepVal,
        unit: 'h',
        caption: 'Logged from Talk',
        // Signal Confidence is derived from the logged value — no hardcoded mock %.
        status: 'OPTIMAL',
        statusColor: '#a8ff53',
      });
      dispatched.push({ type: 'sleep', value: sleepVal });
    }
  }

  if (stepsMatch) {
    const stepsVal = stepsMatch[1] || stepsMatch[2];
    if (stepsVal) {
      console.log('[LOCAL MODE] Mock parser: steps =', stepsVal);
      dispatchTendaiUpdateAgent(LOCAL_MOCK_AGENT_IDS.move, {
        value: stepsVal,
        unit: 'steps',
        caption: 'Logged from Talk',
        // Signal Confidence is derived from the logged value — no hardcoded mock %.
        status: 'OPTIMAL',
        statusColor: '#a8ff53',
      });
      dispatched.push({ type: 'steps', value: stepsVal });
    }
  }

  if (!dispatched.length) {
    console.log('[LOCAL MODE] Mock parser: no sleep/steps tokens — skipping Tendai:UpdateAgent');
  }

  return dispatched;
}

function localFallbackResponse(opts = {}) {
  const userInput = opts.userInput != null ? String(opts.userInput) : '';
  const mockMetrics = userInput ? dispatchLocalMockUpdateAgentFromInput(userInput) : [];

  const discuss = opts.discussContext && typeof opts.discussContext === 'object' ? opts.discussContext : null;
  const discussAgent = discuss && discuss.agent ? String(discuss.agent).trim() : '';
  const ledger = getCommonLedger();
  const rows = Array.isArray(ledger.agent_insights) ? ledger.agent_insights : [];
  const byAgent = (name) => rows.find((r) => String(r.agent || '').toLowerCase().includes(name));
  const sleep = byAgent('sleep');
  const steps = byAgent('step');
  const weather = byAgent('weather');
  const sleepText = sleep ? String(sleep.status || '').trim() : 'Sleep data unavailable';
  const stepsText = steps ? String(steps.status || '').trim() : 'Steps data unavailable';
  const weatherText = weather ? String(weather.status || '').trim() : 'Weather data unavailable';
  const isWeatherCritical = /strong\s+wind|critical|thermal drain/i.test(weatherText);
  const discussLead = discussAgent
    ? `I'm in offline mode, but let's talk specifically about the ${discussAgent} report. `
    : '';
  const action = isWeatherCritical
    ? 'Because of the Strong Wind alert, stay indoors and switch to a safe indoor walk/mobility block.'
    : 'Conditions look stable; continue your routine with normal caution.';
  const mockNote = mockMetrics.length
    ? ` Parsed ${mockMetrics.map((m) => `${m.value} (${m.type})`).join(', ')} from your message and pushed to agent cards (local bridge).`
    : '';
  return `[LOCAL MODE] ${discussLead}I've analyzed your local data: ${stepsText}. ${sleepText}. Weather: ${weatherText}. ${action}${mockNote}`;
}

/**
 * @returns {string} Backend base URL (no trailing slash)
 */
export function getBackendURL() {
  if (typeof window !== 'undefined') {
    const override = window.SERRON_BACKEND_URL || window.TENDAI_BACKEND_URL;
    if (override) return String(override).replace(/\/$/, '');
  }
  try {
    if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '')) {
      const p = location.port || (location.protocol === 'https:' ? '443' : '80');
      // PWA on :3000 (serve) or Live Server / other local ports: relay stays on :3001.
      if (p === '3000' || p === '5500' || p === '8080' || p === '5173') {
        return 'http://127.0.0.1:3001';
      }
    }
  } catch (_) {}
  return DEFAULT_BACKEND_URL;
}

/** JSON + optional Bearer for secured relays (window.SERRON_BACKEND_BEARER). */
export function buildBackendHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    const bearer =
      window.SERRON_BACKEND_BEARER ||
      window.SERRON_TALK_BEARER ||
      window.TENDAI_BACKEND_BEARER ||
      window.TENDAI_TALK_BEARER;
    const token = bearer != null ? String(bearer).trim() : '';
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

function getTodayLocalIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const SERRON_USER_PROFILE = {
  name: 'Anton',
  age: 43,
  location: 'NJ',
  occupation: 'IT Architect/Developer',
  goals: [
    'Longevity optimization',
    'High nutritional density',
    '10,000 steps daily target',
  ],
};

/**
 * Assembles a live context snapshot for the current TALK request.
 * Called on every send so the LLM always reasons against the freshest state.
 *
 * @returns {Promise<{ profile: typeof SERRON_USER_PROFILE, contextInstruction: string }>}
 */
async function getSystemContextSnapshot() {
  let biometricsSummary = 'No biometric data recorded today.';
  try {
    const record = await getMetricsByDate(getTodayLocalIsoDate());
    if (record && record.metrics) {
      const parts = [];
      if (Number.isFinite(record.metrics.steps)) {
        parts.push(`Steps today: ${Math.round(record.metrics.steps)}`);
      }
      if (Number.isFinite(record.metrics.sleep)) {
        parts.push(`Sleep last night: ${Math.round(record.metrics.sleep * 10) / 10} hours`);
      }
      if (parts.length) biometricsSummary = parts.join('. ') + '.';
    }
  } catch (_) {
    // IndexedDB unavailable — proceed with "no data" summary.
  }

  const contextInstruction = [
    `User: ${SERRON_USER_PROFILE.name}, ${SERRON_USER_PROFILE.age}, ${SERRON_USER_PROFILE.occupation}, ${SERRON_USER_PROFILE.location}.`,
    `Current State: ${biometricsSummary}`,
    `Goals: ${SERRON_USER_PROFILE.goals.join('; ')}.`,
    'Analyze the user\'s input considering this context.',
    'Be concise, logical, and focus on systemic efficiency.',
    'Provide insights on how today\'s metrics impact his stated goals.',
    'NO medical advice.',
    'Tone: hardware-grade, analytical, candid.',
  ].join(' ');

  return { profile: SERRON_USER_PROFILE, contextInstruction };
}

/**
 * If Gemini returned the biometric intent JSON, persist + notify; else return conversational text unchanged.
 * @param {string} replyText
 * @returns {Promise<string>}
 */
async function processGeminiTalkReply(replyText) {
  const trimmed = String(replyText || '').trim();
  if (!trimmed) return trimmed;

  let parsed = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch (_) {
    return trimmed;
  }

  if (!parsed || typeof parsed !== 'object' || parsed.intent !== 'log_biometrics') {
    return trimmed;
  }

  const metrics = parsed.metrics;
  if (!metrics || typeof metrics !== 'object') {
    return trimmed;
  }

  const steps = Number(metrics.steps);
  const sleep = Number(metrics.sleep);
  if (!Number.isFinite(steps) || !Number.isFinite(sleep)) {
    return trimmed;
  }

  // Biometric intent came from the relay — clear stale "local" UI even if we were stuck offline before.
  if (typeof window !== 'undefined') {
    window.__serronForceLocalConversation = false;
  }
  NetworkController.markReachable();
  setOfflineBrainIndicator(false);
  setServerStatus('Online');

  const payload = {
    date: getTodayLocalIsoDate(),
    metrics: { steps, sleep },
  };

  try {
    await saveMetrics(payload);
  } catch (err) {
    logTalkError('biometrics-intent-save', err, { payload });
    return trimmed;
  }

  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('biometricsUpdated', { detail: payload }));
    }
  } catch (err) {
    logTalkError('biometrics-intent-event', err, { payload });
  }

  return '[ System: Biometric payload recorded. ]';
}

function isRetriableNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  const cause = String((err.cause && err.cause.message) || '');
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Network request failed') ||
    /ERR_CONNECTION_REFUSED/i.test(msg + ' ' + cause) ||
    (err.name === 'TypeError' && /fetch/i.test(msg))
  );
}

/**
 * Wraps fetchBackend with per-attempt timeouts and exponential backoff.
 * Only retries on transient network errors (Wi-Fi reconnecting after OS sleep, etc.).
 * Non-network errors (AbortError, HTTP errors) propagate immediately.
 */
async function fetchWithRetry(url, fetchOptions) {
  const totalAttempts = TALK_FETCH_MAX_RETRIES + 1;
  let lastError = null;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TALK_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchBackend(url, {
        ...fetchOptions,
        signal: abortController.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if (!isRetriableNetworkError(err) || attempt >= TALK_FETCH_MAX_RETRIES) {
        throw err;
      }

      const delay = TALK_FETCH_RETRY_DELAYS[attempt] ?? TALK_FETCH_RETRY_DELAYS[TALK_FETCH_RETRY_DELAYS.length - 1];
      console.warn(
        `[Serron Talk] Network error on attempt ${attempt + 1}/${totalAttempts}, retrying in ${delay}ms…`,
        err.message,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function logTalkError(phase, err, extra = {}) {
  const payload = {
    phase,
    name: err && err.name,
    message: err && err.message,
    ...extra,
  };
  console.error('[Serron Talk]', payload);
  if (err && err.stack) {
    console.error('[Serron Talk] Stack:', err.stack);
  }
}

/**
 * Send message to backend LLM proxy
 * @param {string} text - User message
 * @param {Object} [context] - { userProfile?: { name, age, location, goals }, systemContext?: string }
 * @returns {Promise<string>} - AI reply
 */
export async function sendMessageToLLM(text, context) {
  // Validate input
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Message cannot be empty');
  }

  if (text.length > 2000) {
    throw new Error('Message is too long (max 2000 characters)');
  }

  const BACKEND_URL = getBackendURL();
  const API_URL = `${BACKEND_URL}/api/talk`;

  // Force online priority: each send resets stale "local" gate so wake / network changes get a fresh relay attempt.
  if (typeof window !== 'undefined') {
    window.__serronForceLocalConversation = false;
  }
  NetworkController.isBackendReachable = true;
  setOfflineBrainIndicator(false);

  const snapshot = await getSystemContextSnapshot();

  const body = { message: text.trim() };
  if (context && context.userProfile && typeof context.userProfile === 'object') {
    body.userProfile = context.userProfile;
  } else {
    body.userProfile = snapshot.profile;
  }
  const callerContext = context && context.systemContext && typeof context.systemContext === 'string'
    ? context.systemContext.trim()
    : '';
  body.profileContext = callerContext
    ? `${snapshot.contextInstruction}\n\n${callerContext}`
    : snapshot.contextInstruction;
  let hasRecentLedger = false;
  try {
    const ledger = getCommonLedger();
    const recentAgentInsights = Array.isArray(ledger.agent_insights)
      ? [...ledger.agent_insights]
          .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
          .slice(0, 10)
      : [];
    hasRecentLedger = recentAgentInsights.length > 0;
    const extraState =
      context && context.systemState && typeof context.systemState === 'object' && !Array.isArray(context.systemState)
        ? context.systemState
        : {};
    const discussContext =
      typeof window !== 'undefined' &&
      window.__serronDiscussContext &&
      typeof window.__serronDiscussContext === 'object'
        ? window.__serronDiscussContext
        : null;
    body.system_state = hasRecentLedger
      ? {
          ...extraState,
          common_ledger: ledger,
          common_ledger_recent: recentAgentInsights,
          user_memory: getUserMemory(),
          ...(discussContext ? { discuss_context: discussContext } : {}),
        }
      : {
          ...extraState,
          // Data-integrity fallback: avoid sending empty recent ledger payloads.
          user_memory: getUserMemory(),
          simplified_context: true,
          ...(discussContext ? { discuss_context: discussContext } : {}),
        };
  } catch (_) {
    body.system_state = { simplified_context: true };
  }

  try {
    const discussContext = body.system_state && body.system_state.discuss_context ? body.system_state.discuss_context : null;
    const mustStayLocal = typeof window !== 'undefined' && window.__serronForceLocalConversation === true;
    const localhostDevRelay =
      isLocalhostRelayBackend(DEFAULT_BACKEND_URL) && isLocalhostRelayBackend(BACKEND_URL);
    if ((!NetworkController.isBackendReachable || mustStayLocal) && !localhostDevRelay) {
      if (typeof window !== 'undefined') window.__serronForceLocalConversation = true;
      setOfflineBrainIndicator(true);
      return localFallbackResponse({ discussContext, userInput: text });
    }
    if (typeof window !== 'undefined') window.__serronForceLocalConversation = false;

    const response = await fetchWithRetry(API_URL, {
      method: 'POST',
      headers: buildBackendHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage = 'Unable to get response from Serron';
      let errorBody = null;
      try {
        errorBody = await response.json();
        errorMessage = errorBody.message || errorBody.error || errorMessage;
      } catch (e) {
        errorMessage = response.statusText || `Server returned ${response.status}`;
      }

      logTalkError('http-error', new Error(errorMessage), {
        API_URL,
        backendBase: BACKEND_URL,
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });

      throw new Error(errorMessage);
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      logTalkError('parse-json', e, { API_URL, backendBase: BACKEND_URL });
      throw new Error('Invalid response format from server');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response from server');
    }

    if (!data.reply || typeof data.reply !== 'string') {
      logTalkError('bad-shape', new Error('missing reply'), { API_URL, dataKeys: data ? Object.keys(data) : [] });
      throw new Error('No reply in response from Serron');
    }

    if (typeof window !== 'undefined') {
      window.__serronForceLocalConversation = false;
    }
    NetworkController.markReachable();
    setOfflineBrainIndicator(false);
    setServerStatus('Online');

    let replyOut = data.reply.trim();
    try {
      replyOut = await processGeminiTalkReply(replyOut);
    } catch (err) {
      logTalkError('gemini-reply-intent-parse', err, { API_URL });
    }
    return replyOut;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      logTalkError('timeout', error, {
        API_URL,
        backendBase: BACKEND_URL,
        timeoutMs: TALK_FETCH_TIMEOUT_MS,
        retries: TALK_FETCH_MAX_RETRIES,
      });
      throw new Error('The request took too long. Please try again.');
    }

    const msg = String(error.message || '');
    const causeMsg = String((error && error.cause && error.cause.message) || '');
    const combinedMsg = `${msg} ${causeMsg}`;
    const isNetwork =
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Network request failed') ||
      (error.name === 'TypeError' && msg.includes('fetch'));
    const isConnectionRefused =
      /ERR_CONNECTION_REFUSED/i.test(combinedMsg) ||
      (/Failed to fetch/i.test(combinedMsg) && /3001/.test(API_URL));

    if (
      msg.includes('Backend offline (stealth)') ||
      msg.includes('Backend offline (gatekeeper)') ||
      (error.name === 'TypeError' && /stealth|gatekeeper/i.test(msg))
    ) {
      setServerStatus('Offline');
      const discussContext = body.system_state && body.system_state.discuss_context ? body.system_state.discuss_context : null;
      if (typeof window !== 'undefined') window.__serronForceLocalConversation = true;
      setOfflineBrainIndicator(true);
      return localFallbackResponse({ discussContext, userInput: text });
    }

    if (isConnectionRefused || isNetwork) {
      logTalkError('network-retries-exhausted', error, {
        API_URL,
        backendBase: BACKEND_URL,
        retries: TALK_FETCH_MAX_RETRIES,
        hint:
          'Start tendai-backend (npm start in tendai-backend/). Default relay is :3001 while the PWA dev server is often :3000. Set window.SERRON_BACKEND_URL if your relay URL differs.',
      });
      setServerStatus('Offline');
      const discussContext = body.system_state && body.system_state.discuss_context ? body.system_state.discuss_context : null;
      if (typeof window !== 'undefined') window.__serronForceLocalConversation = true;
      setOfflineBrainIndicator(true);
      return localFallbackResponse({ discussContext, userInput: text });
    }

    if (msg.includes('CORS') || msg.includes('cross-origin')) {
      logTalkError('cors', error, { API_URL, backendBase: BACKEND_URL });
      throw new Error('Connection blocked. Please check backend CORS settings.');
    }

    if (error.message && !msg.includes('TypeError') && !msg.includes('SyntaxError') && msg.length > 0) {
      throw error;
    }

    logTalkError('unknown', error, { API_URL, backendBase: BACKEND_URL });
    throw new Error('Something went wrong. Please try again in a moment.');
  }
}

const ADVISORY_STORAGE_KEY = 'tendai_active_advisory';

function showAdvisoryInUI(text) {
  try {
    localStorage.setItem(ADVISORY_STORAGE_KEY, text);
  } catch (_) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('serron:show-advisory', { detail: { text } }),
    );
  }
}

/**
 * Background analysis: when new biometrics arrive, ask the LLM to evaluate
 * whether a critical deficit exists. If so, persist a system advisory that
 * stays visible until the user acknowledges it.
 *
 * @param {Record<string, unknown>} biometricData
 */
async function triggerProactiveAnalysis(biometricData) {
  if (!biometricData || typeof biometricData !== 'object') return;

  const BACKEND_URL = getBackendURL();
  const API_URL = `${BACKEND_URL}/api/talk`;
  const analysisPrompt =
    'SYSTEM PROMPT: Analyze these new biometrics for Anton (43, IT Architect, goals: 10k steps). Data: ' +
    JSON.stringify(biometricData) +
    '. IF there is a critical deficit (e.g., sleep < 6h, steps very low), generate a strict, 2-sentence hardware-grade warning about cognitive/systemic risks. IF data is normal/acceptable, reply EXACTLY with the string \'STATUS_NORMAL\'.';

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TALK_FETCH_TIMEOUT_MS);

    const response = await fetchBackend(API_URL, {
      method: 'POST',
      headers: buildBackendHeaders(),
      body: JSON.stringify({ message: analysisPrompt }),
      signal: abortController.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return;

    const data = await response.json();
    const reply = String(data?.reply || '').trim();

    if (!reply || reply === 'STATUS_NORMAL') return;

    showAdvisoryInUI(reply);
  } catch (err) {
    logTalkError('proactive-analysis', err, { biometricData });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('biometricsUpdated', (ev) => {
    const detail = /** @type {CustomEvent} */ (ev).detail;
    if (!detail || typeof detail !== 'object') return;
    triggerProactiveAnalysis(detail);
  });
}
