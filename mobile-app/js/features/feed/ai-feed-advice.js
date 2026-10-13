// Serron — AI Feed Advice Module
// @owner: feed
// @role: utils
// Unified AI advice for Feed blocks (Quick advice, Nutrition insight, Tips)

import { getBackendURL, buildBackendHeaders } from '../talk/llm.js';
import { fetchBackend } from '../../core/backend-fetch.js';
import { NetworkController } from '../../infrastructure/network-controller.js';
import { getMetricsByDate } from '../../core/biometrics-db.js';
import { getUserProfile } from '../talk/talk-context.js';
import { recordDataSent, updateDataSentOutcome, DATA_SENT_REQUEST_TYPES } from '../talk/data-sent-log.js';
import { dayState } from '../../state.js';
import { isAutoFeedAdviceEnabled } from '../settings/auto-requests.js';

// Состояние загрузки AI-советов
let aiAdviceLoading = false;
let lastAiAdviceTime = null;
let cachedAdvice = null;
const AI_ADVICE_CACHE_MS = 5 * 60 * 1000; // Кэш на 5 минут

function getTodayLocalIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Only values the user actually provided; anything missing is omitted, never defaulted.
 * Profile is limited to the fields useful for daily advice (no name or location).
 */
async function collectStateForAI() {
  const profile = {};
  const provided = getUserProfile() || {};
  if (provided.age != null) profile.age = provided.age;
  if (Array.isArray(provided.goals) && provided.goals.length) profile.goals = provided.goals;
  if (Array.isArray(provided.diet) && provided.diet.length) profile.diet = provided.diet;
  if (Array.isArray(provided.habits) && provided.habits.length) profile.habits = provided.habits;

  let today = null;
  try {
    today = dayState.loadDayStateForToday();
  } catch (_) {
    // Day state unavailable — send nothing for today.
  }
  let biometrics = null;
  try {
    const record = await getMetricsByDate(getTodayLocalIsoDate());
    biometrics = record && record.metrics ? record.metrics : null;
  } catch (_) {
    // IndexedDB unavailable — no steps/sleep from it.
  }

  const day = {};
  const steps = Number(biometrics?.steps);
  if (Number.isFinite(steps) && steps > 0) day.stepsToday = Math.round(steps);
  const daySleep = Number(today?.sleep?.hours);
  const dbSleep = Number(biometrics?.sleep);
  if (today?.sleep?.hours != null && Number.isFinite(daySleep) && daySleep > 0) day.sleepLastNight = daySleep;
  else if (Number.isFinite(dbSleep) && dbSleep > 0) day.sleepLastNight = Math.round(dbSleep * 10) / 10;
  const water = Number(today?.water?.current);
  if (Number.isFinite(water) && water > 0) day.hydrationLogged = water;
  if (typeof today?.energy === 'string' && today.energy.trim()) {
    const energy = today.energy.toLowerCase();
    if (energy.includes('great') || energy.includes('very high')) day.moodToday = 'Great';
    else if (energy.includes('good') || energy.includes('high')) day.moodToday = 'Good';
    else if (energy.includes('normal') || energy.includes('medium')) day.moodToday = 'Normal';
    else day.moodToday = 'Low';
  }

  return {
    profileState: profile,
    dayState: day,
  };
}

/**
 * Получает AI-советы от backend
 */
async function fetchAIAdvice() {
  const now = Date.now();
  const cacheAge = lastAiAdviceTime ? (now - lastAiAdviceTime) : null;

  // Проверяем кэш
  if (lastAiAdviceTime && cacheAge < AI_ADVICE_CACHE_MS && cachedAdvice) {
    return cachedAdvice; // Возвращаем закэшированные данные
  }

  if (aiAdviceLoading) {
    return null; // Уже загружается
  }

  // Relay gatekeeper would reject the request anyway; nothing is sent, so nothing is logged.
  if (!NetworkController.isBackendReachable) {
    return null;
  }

  let logEntry = null;
  try {
    aiAdviceLoading = true;
    const state = await collectStateForAI();
    const profileKeys = Object.keys(state.profileState);
    const dayKeys = Object.keys(state.dayState);
    logEntry = recordDataSent({
      requestType: DATA_SENT_REQUEST_TYPES.FEED_ADVICE,
      trigger: 'automatic',
      dataCategoriesIncluded: [
        profileKeys.length ? `profile: ${profileKeys.join(', ')}` : 'profile: none',
        dayKeys.length
          ? `today: ${dayKeys.map((k) => `${k} ${state.dayState[k]}`).join(', ')}`
          : 'today: nothing logged (no values sent)',
      ],
    });

    let response;
    try {
      response = await fetchBackend(`${getBackendURL()}/api/feed-advice`, {
        method: 'POST',
        headers: buildBackendHeaders(),
        body: JSON.stringify(state),
      });
    } catch (err) {
      updateDataSentOutcome(logEntry.id, 'not sent — request failed');
      throw err;
    }

    if (!response.ok) {
      updateDataSentOutcome(logEntry.id, `sent — relay returned HTTP ${response.status}`);
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
    }

    const data = await response.json();
    if (!data || data.fallback || !data.quickAdvice || !data.nutritionInsight) {
      updateDataSentOutcome(logEntry.id, 'sent — no usable AI reply (nothing shown)');
      return null;
    }
    updateDataSentOutcome(logEntry.id, 'sent — advice shown in Feed');
    data.sourceNote = profileKeys.length && dayKeys.length
      ? "Written by Google's Gemini from your profile and what you've logged today."
      : dayKeys.length
        ? "Written by Google's Gemini from what you've logged today."
        : profileKeys.length
          ? "Written by Google's Gemini from your profile. You haven't logged anything today."
          : "Written by Google's Gemini. You haven't added profile details or logged anything today, so this is general advice.";
    lastAiAdviceTime = now;
    cachedAdvice = data; // Сохраняем в кэш

    return data;
  } catch (error) {
    return null;
  } finally {
    aiAdviceLoading = false;
  }
}

/**
 * Обновляет блоки Feed с AI-советами
 * Card stays hidden unless a real AI reply is available (no canned defaults shown as advice).
 */
export async function updateFeedWithAIAdvice() {
  const card = document.getElementById('feedAdviceCard');
  const quickAdviceText = document.getElementById('quickAdviceText');
  const feedNutritionText = document.getElementById('feedNutritionText');
  const inspirationText = document.getElementById('inspirationText'); // optional (Tips block removed in Clean Slate)
  const sourceText = document.getElementById('feedAdviceSource');

  if (!quickAdviceText || !feedNutritionText) {
    return;
  }

  if (!isAutoFeedAdviceEnabled()) {
    if (card) card.hidden = true;
    return;
  }

  const advice = await fetchAIAdvice();
  if (!isAutoFeedAdviceEnabled()) {
    if (card) card.hidden = true;
    return;
  }
  if (!advice) {
    if (card && !cachedAdvice) card.hidden = true;
    return;
  }

  quickAdviceText.textContent = advice.quickAdvice;
  feedNutritionText.textContent = advice.nutritionInsight;
  if (inspirationText && advice.tip) inspirationText.textContent = advice.tip;
  if (sourceText && advice.sourceNote) sourceText.textContent = advice.sourceNote;
  if (card) card.hidden = false;
}

/**
 * Сбрасывает кэш AI-советов
 */
export function resetAIAdviceCache() {
  lastAiAdviceTime = null;
  cachedAdvice = null;
}

// Boot and Feed-open calls are skipped while the relay is offline; run once when it comes online.
if (typeof window !== 'undefined') {
  window.addEventListener('obrium:server-status', (ev) => {
    const status = ev && ev.detail ? ev.detail.status : null;
    if (status === 'Online' && !cachedAdvice && !aiAdviceLoading && isAutoFeedAdviceEnabled()) {
      void updateFeedWithAIAdvice();
    }
  });
}

// Экспорт для глобального использования
window.updateFeedWithAIAdvice = updateFeedWithAIAdvice;
window.resetAIAdviceCache = resetAIAdviceCache;
