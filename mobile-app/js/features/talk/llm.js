// Serron Mobile — LLM Integration
// @owner: talk
// @role: utils

import { getCommonLedger } from '../human-os/common-ledger.js';
import { getUserMemory } from './user-memory.js';
import { fetchBackend, publishBackendStatus } from '../../core/backend-fetch.js';
import { NetworkController } from '../../infrastructure/network-controller.js';
import { saveMetrics, getMetricsByDate } from '../../core/biometrics-db.js';
import { getUserProfile } from './talk-context.js';
import { isAutoHealthChecksEnabled } from '../settings/auto-requests.js';
import { incrementNotification } from '../../core/notifications.js';
import { recordDataSent, updateDataSentOutcome, DATA_SENT_REQUEST_TYPES } from './data-sent-log.js';
import { getBackendBearer, resolveBackendURL } from '../../core/runtime-config.js';
import {
  getDataCollectionMode,
  focusAgentModeInstruction,
  isSensorNagText,
  scrubSensorNagFromContext,
} from '../settings/data-collection-mode.js';

/**
 * Relay URL: window.OBRIUM_BACKEND_URL or <meta name="obrium-backend-url">.
 * On localhost only, falls back to http://127.0.0.1:3001. Production never defaults to localhost.
 * Optional: window.OBRIUM_BACKEND_BEARER / meta obrium-backend-bearer.
 */
const DEV_BACKEND_URL = 'http://127.0.0.1:3001';
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
  window.__obriumOfflineBrain = active === true;
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
function dispatchObriumUpdateAgent(agentId, payload) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(
    new CustomEvent('Obrium:UpdateAgent', {
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
      dispatchObriumUpdateAgent(LOCAL_MOCK_AGENT_IDS.sleep, {
        value: sleepVal,
        unit: 'h',
        caption: 'Logged from Talk',
        // Signal Confidence is derived from the logged value — no hardcoded mock %.
        status: 'LOGGED',
      });
      dispatched.push({ type: 'sleep', value: sleepVal });
    }
  }

  if (stepsMatch) {
    const stepsVal = stepsMatch[1] || stepsMatch[2];
    if (stepsVal) {
      console.log('[LOCAL MODE] Mock parser: steps =', stepsVal);
      dispatchObriumUpdateAgent(LOCAL_MOCK_AGENT_IDS.move, {
        value: stepsVal,
        unit: 'steps',
        caption: 'Logged from Talk',
        // Signal Confidence is derived from the logged value — no hardcoded mock %.
        status: 'LOGGED',
      });
      dispatched.push({ type: 'steps', value: stepsVal });
    }
  }

  if (!dispatched.length) {
    console.log('[LOCAL MODE] Mock parser: no sleep/steps tokens — skipping Obrium:UpdateAgent');
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
  const sleepText = sleep ? String(sleep.status || '').trim() : '';
  const stepsText = steps ? String(steps.status || '').trim() : '';
  const weatherText = weather ? String(weather.status || '').trim() : '';
  const isWeatherCritical = /strong\s+wind|critical|thermal drain/i.test(weatherText);
  const discussLead = discussAgent
    ? `I'm in offline mode, but let's talk specifically about the ${discussAgent} report. `
    : '';
  const known = [];
  if (stepsText) known.push(`Steps: ${stepsText}`);
  if (sleepText) known.push(`Sleep: ${sleepText}`);
  if (weatherText) known.push(`Weather: ${weatherText}`);
  const missing = [];
  if (!stepsText) missing.push('steps');
  if (!sleepText) missing.push('sleep');
  if (!weatherText) missing.push('weather');
  const knownPart = known.length
    ? `From your local data: ${known.join('. ')}.`
    : "I don't have any steps, sleep, or weather data stored locally right now, so I can't assess today.";
  const missingPart = known.length && missing.length ? ` No ${missing.join(' or ')} data on record.` : '';
  const action = isWeatherCritical
    ? ' Because of the Strong Wind alert, stay indoors and switch to a safe indoor walk/mobility block.'
    : '';
  const mockNote = mockMetrics.length
    ? ` Parsed ${mockMetrics.map((m) => `${m.value} (${m.type})`).join(', ')} from your message and pushed to agent cards (local bridge).`
    : '';
  return `[LOCAL MODE] ${discussLead}${knownPart}${missingPart}${action}${mockNote}`;
}

/**
 * @returns {string} Backend base URL (no trailing slash)
 */
export function getBackendURL() {
  return resolveBackendURL() || '';
}

/** JSON + optional Bearer for secured relays (window.OBRIUM_BACKEND_BEARER). */
export function buildBackendHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    const bearer = getBackendBearer();
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

/**
 * Only fields the user actually provided (Master Record); absent fields are omitted, never defaulted.
 * @returns {NonNullable<ReturnType<typeof getUserProfile>> | {}}
 */
function getProvidedUserProfile() {
  return getUserProfile() || {};
}

/**
 * Assembles a live context snapshot for the current TALK request.
 * Called on every send so the LLM always reasons against the freshest state.
 *
 * @returns {Promise<{ profile: ReturnType<typeof getProvidedUserProfile>, contextInstruction: string }>}
 */
async function getSystemContextSnapshot() {
  let biometricsSummary = 'No biometric data recorded today.';
  /** @type {string[]} */
  const biometricKeys = [];
  try {
    const record = await getMetricsByDate(getTodayLocalIsoDate());
    if (record && record.metrics) {
      const parts = [];
      if (Number.isFinite(record.metrics.steps)) {
        parts.push(`Steps today: ${Math.round(record.metrics.steps)}`);
        biometricKeys.push('steps');
      }
      if (Number.isFinite(record.metrics.sleep)) {
        parts.push(`Sleep last night: ${Math.round(record.metrics.sleep * 10) / 10} hours`);
        biometricKeys.push('sleep');
      }
      if (parts.length) biometricsSummary = parts.join('. ') + '.';
    }
  } catch (_) {
    // IndexedDB unavailable — proceed with "no data" summary.
  }

  const profile = getProvidedUserProfile();
  const profileBits = [];
  if (profile.name) profileBits.push(`name ${profile.name}`);
  if (profile.age != null) profileBits.push(`age ${profile.age}`);
  if (profile.goals) profileBits.push(`goals: ${profile.goals.join('; ')}`);
  if (profile.diet) profileBits.push(`diet: ${profile.diet.join('; ')}`);
  if (profile.habits) profileBits.push(`habits: ${profile.habits.join('; ')}`);

  const contextInstruction = [
    `User-provided profile: ${profileBits.length ? profileBits.join(', ') : 'nothing provided yet'}.`,
    `Current State: ${biometricsSummary}`,
    `Data collection mode: ${getDataCollectionMode()}.`,
    focusAgentModeInstruction(),
    'Anything not listed above is unknown: do not assume, estimate, or invent it.',
    'Analyze the user\'s input considering this context.',
    'Be concise, logical, and focus on systemic efficiency.',
    'Relate today\'s metrics to the user\'s stated goals only if goals are listed above.',
    'NO medical advice.',
    'Tone: hardware-grade, analytical, candid.',
  ].join(' ');

  return { profile, contextInstruction, biometricKeys };
}

const LEDGER_RECENT_LIMIT = 5;
const USER_MEMORY_LOG_ITEM_CHARS = 60;

const PROFILE_FIELD_LOG_LABELS = {
  name: 'name',
  age: 'age',
  location: 'location',
  goals: 'goals',
  wantFromObrium: 'what you want from Obrium',
  motivationLevel: 'motivation',
  diet: 'diet',
  habits: 'habits',
};

/**
 * Newest ledger rows only, slimmed to what the model uses. The row for a discussed Feed card is always kept.
 * @param {{ agent_insights?: Array<object> }} ledger
 * @param {string} [discussAgent]
 */
function selectRecentLedgerRows(ledger, discussAgent) {
  const rows = Array.isArray(ledger && ledger.agent_insights) ? [...ledger.agent_insights] : [];
  rows.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  const picked = rows.slice(0, LEDGER_RECENT_LIMIT);
  const wanted = String(discussAgent || '').trim().toLowerCase();
  if (wanted && !picked.some((r) => String(r.agent || '').toLowerCase() === wanted)) {
    const row = rows.find((r) => String(r.agent || '').toLowerCase() === wanted);
    if (row) picked.push(row);
  }
  return picked
    .filter((r) => !isSensorNagText(r && r.status))
    .map((r) => ({
      agent: r.agent,
      status: scrubSensorNagFromContext(r.status) || String(r.status || '').trim(),
      priority: r.priority,
      ...(r.done ? { done: true } : {}),
      updatedAt: r.updatedAt,
    }))
    .filter((r) => r.status);
}

/**
 * Data categories in a Talk request body, for the data-sent log.
 * @param {object} body
 * @param {{ requestType: string, biometricKeys: string[], extraCategories: string[] }} meta
 */
function describeTalkPayload(body, meta) {
  const cats = [];
  if (meta.requestType === DATA_SENT_REQUEST_TYPES.PROFILE_GREETING) {
    cats.push('greeting instruction (no user text)');
  } else {
    cats.push(`message text (${String(body.message || '').length} chars)`);
  }
  const profileKeys = Object.keys(body.userProfile || {}).filter((k) => body.userProfile[k] != null);
  cats.push(
    profileKeys.length
      ? `profile: ${profileKeys.map((k) => PROFILE_FIELD_LOG_LABELS[k] || k).join(', ')}`
      : 'profile: nothing provided yet',
  );
  cats.push(meta.biometricKeys.length ? `today's biometrics: ${meta.biometricKeys.join(', ')}` : "today's biometrics: none recorded");
  cats.push(...meta.extraCategories);
  const st = body.system_state || {};
  if (Array.isArray(st.common_ledger_recent)) {
    cats.push(`ledger: ${st.common_ledger_recent.length} item${st.common_ledger_recent.length === 1 ? '' : 's'}`);
  }
  const insights = st.user_memory && Array.isArray(st.user_memory.insights) ? st.user_memory.insights : null;
  if (insights) {
    const shown = insights.map((x) => {
      const s = String(x);
      return s.length > USER_MEMORY_LOG_ITEM_CHARS ? `${s.slice(0, USER_MEMORY_LOG_ITEM_CHARS - 1)}…` : s;
    });
    cats.push(`user_memory: ${insights.length} item${insights.length === 1 ? '' : 's'}${shown.length ? ` (${shown.join('; ')})` : ''}`);
  }
  if (st.discuss_context) {
    const agent = st.discuss_context.agent ? String(st.discuss_context.agent) : 'Feed card';
    cats.push(`Feed card discussed: ${agent}`);
  }
  return cats;
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
    window.__obriumForceLocalConversation = false;
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
        `[Obrium Talk] Network error on attempt ${attempt + 1}/${totalAttempts}, retrying in ${delay}ms…`,
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
  console.error('[Obrium Talk]', payload);
  if (err && err.stack) {
    console.error('[Obrium Talk] Stack:', err.stack);
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
  const API_URL = BACKEND_URL ? `${BACKEND_URL}/api/talk` : '';

  // Force online priority: each send resets stale "local" gate so wake / network changes get a fresh relay attempt.
  // Missing production relay URL stays offline — never falls back to localhost.
  if (typeof window !== 'undefined') {
    window.__obriumForceLocalConversation = false;
  }
  if (BACKEND_URL) {
    NetworkController.isBackendReachable = true;
    setOfflineBrainIndicator(false);
  } else {
    NetworkController.isBackendReachable = false;
    setOfflineBrainIndicator(true);
    setServerStatus('Offline');
  }

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
  const requestType = (context && context.requestType) || DATA_SENT_REQUEST_TYPES.TALK_MESSAGE;
  const includeLedger = !(context && context.includeLedger === false);
  try {
    const extraState =
      context && context.systemState && typeof context.systemState === 'object' && !Array.isArray(context.systemState)
        ? context.systemState
        : {};
    const discussContextRaw =
      typeof window !== 'undefined' &&
      window.__obriumDiscussContext &&
      typeof window.__obriumDiscussContext === 'object'
        ? window.__obriumDiscussContext
        : null;
    const discussContext = discussContextRaw
      ? {
          ...discussContextRaw,
          status: scrubSensorNagFromContext(discussContextRaw.status),
          insight_summary: scrubSensorNagFromContext(discussContextRaw.insight_summary),
          logic: scrubSensorNagFromContext(discussContextRaw.logic),
        }
      : null;
    if (discussContext && !discussContext.status && isSensorNagText(discussContextRaw.status)) {
      discussContext.status = 'Manual baseline — calibrate via Talk and check-ins.';
    }
    const recentLedger = includeLedger
      ? selectRecentLedgerRows(getCommonLedger(), discussContext && discussContext.agent)
      : [];
    body.system_state = {
      ...extraState,
      dataCollectionMode: getDataCollectionMode(),
      user_memory: getUserMemory(),
      ...(recentLedger.length ? { common_ledger_recent: recentLedger } : { simplified_context: true }),
      ...(discussContext ? { discuss_context: discussContext } : {}),
    };
  } catch (_) {
    body.system_state = { simplified_context: true };
  }

  const logEntry = recordDataSent({
    requestType,
    trigger: requestType === DATA_SENT_REQUEST_TYPES.PROFILE_GREETING ? 'automatic' : 'user',
    dataCategoriesIncluded: describeTalkPayload(body, {
      requestType,
      biometricKeys: snapshot.biometricKeys,
      extraCategories: Array.isArray(context && context.dataCategories) ? context.dataCategories : [],
    }),
  });
  const notSent = () => updateDataSentOutcome(logEntry.id, 'not sent — relay offline, answered on device');
  let reachedRelay = false;

  try {
    const discussContext = body.system_state && body.system_state.discuss_context ? body.system_state.discuss_context : null;
    const mustStayLocal = typeof window !== 'undefined' && window.__obriumForceLocalConversation === true;
    const localhostDevRelay =
      isLocalhostRelayBackend(DEV_BACKEND_URL) && isLocalhostRelayBackend(BACKEND_URL);
    if ((!NetworkController.isBackendReachable || mustStayLocal) && !localhostDevRelay) {
      if (typeof window !== 'undefined') window.__obriumForceLocalConversation = true;
      setOfflineBrainIndicator(true);
      notSent();
      return localFallbackResponse({ discussContext, userInput: text });
    }
    if (typeof window !== 'undefined') window.__obriumForceLocalConversation = false;

    const response = await fetchWithRetry(API_URL, {
      method: 'POST',
      headers: buildBackendHeaders(),
      body: JSON.stringify(body),
    });
    reachedRelay = true;
    updateDataSentOutcome(logEntry.id, response.ok ? 'sent' : `sent — relay returned HTTP ${response.status}`);

    if (!response.ok) {
      let errorMessage = 'Unable to get response from Obrium';
      let errorBody = null;
      try {
        errorBody = await response.json();
        errorMessage = errorBody.message || errorBody.error || errorMessage;
      } catch (e) {
        errorMessage = response.statusText || `Server returned ${response.status}`;
      }

      const code = errorBody && errorBody.code ? String(errorBody.code) : '';
      const busyCodes = new Set(['rate_limited', 'daily_cap', 'gemini_quota', 'upstream_timeout']);
      if (response.status === 429 || response.status === 503 || busyCodes.has(code)) {
        logTalkError('http-busy', new Error(code || String(response.status)), {
          API_URL,
          backendBase: BACKEND_URL,
          status: response.status,
          code,
        });
        throw new Error('Obrium is busy, try again later');
      }

      logTalkError('http-error', new Error(errorMessage), {
        API_URL,
        backendBase: BACKEND_URL,
        status: response.status,
        statusText: response.statusText,
        code,
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
      throw new Error('No reply in response from Obrium');
    }

    if (typeof window !== 'undefined') {
      window.__obriumForceLocalConversation = false;
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
      updateDataSentOutcome(logEntry.id, 'timed out — the relay may have received it');
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
      if (typeof window !== 'undefined') window.__obriumForceLocalConversation = true;
      setOfflineBrainIndicator(true);
      notSent();
      return localFallbackResponse({ discussContext, userInput: text });
    }

    if (!reachedRelay) updateDataSentOutcome(logEntry.id, 'not sent — request failed');

    if (isConnectionRefused || isNetwork) {
      logTalkError('network-retries-exhausted', error, {
        API_URL,
        backendBase: BACKEND_URL,
        retries: TALK_FETCH_MAX_RETRIES,
        hint:
          'Start tendai-backend (npm start in tendai-backend/). Default relay is :3001 while the PWA dev server is often :3000. Set window.OBRIUM_BACKEND_URL if your relay URL differs.',
      });
      setServerStatus('Offline');
      const discussContext = body.system_state && body.system_state.discuss_context ? body.system_state.discuss_context : null;
      if (typeof window !== 'undefined') window.__obriumForceLocalConversation = true;
      setOfflineBrainIndicator(true);
      notSent();
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
  incrementNotification('talk');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('obrium:show-advisory', { detail: { text } }),
    );
  }
}

/**
 * Background analysis: when new biometrics arrive, ask the LLM whether a value
 * is clearly off. If so, persist an advisory that Talk shows the next time it opens.
 *
 * @param {Record<string, unknown>} biometricData
 */
async function triggerProactiveAnalysis(biometricData) {
  if (!biometricData || typeof biometricData !== 'object') return;

  const BACKEND_URL = getBackendURL();
  const API_URL = `${BACKEND_URL}/api/talk`;
  const analysisPrompt =
    'SYSTEM PROMPT: Analyze these new biometrics. Use only the values in Data; do not assume any other facts about the user. Data: ' +
    JSON.stringify(biometricData) +
    '. IF a value is clearly outside a typical range (e.g., sleep under 6 hours, very low steps), write 2 short, calm sentences addressed to the user: name the value, then suggest one gentle, practical step for today. Frame it as worth a look, not an alert. Do not diagnose, name medical conditions, or describe health risks or consequences. IF data is normal/acceptable, reply EXACTLY with the string \'STATUS_NORMAL\'.';

  const fields = Object.keys(biometricData).filter((k) => biometricData[k] != null);
  const logEntry = recordDataSent({
    requestType: DATA_SENT_REQUEST_TYPES.BACKGROUND_BIOMETRIC_CHECK,
    trigger: 'automatic',
    dataCategoriesIncluded: [
      `biometrics (raw values): ${fields.join(', ') || 'none'}`,
      'no profile, ledger or user_memory attached',
    ],
  });
  console.info(
    `[Obrium] Background check: sending new biometrics (${fields.join(', ')}) to the AI without a Talk message.`,
  );

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

    if (!response.ok) {
      updateDataSentOutcome(logEntry.id, `sent — relay returned HTTP ${response.status}`);
      return;
    }

    const data = await response.json();
    const reply = String(data?.reply || '').trim();

    if (!reply || reply === 'STATUS_NORMAL') {
      updateDataSentOutcome(logEntry.id, 'sent — result: normal, nothing shown');
      return;
    }

    updateDataSentOutcome(logEntry.id, 'sent — result: warning returned');
    showAdvisoryInUI(reply);
  } catch (err) {
    updateDataSentOutcome(
      logEntry.id,
      err && err.name === 'AbortError' ? 'timed out — the relay may have received it' : 'not sent — request failed',
    );
    logTalkError('proactive-analysis', err, { biometricData });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('biometricsUpdated', (ev) => {
    const detail = /** @type {CustomEvent} */ (ev).detail;
    if (!detail || typeof detail !== 'object') return;
    if (!isAutoHealthChecksEnabled()) return;
    triggerProactiveAnalysis(detail);
  });
}
