// Serron — AI Feed Advice Module
// @owner: feed
// @role: utils
// Unified AI advice for Feed blocks (Quick advice, Nutrition insight, Tips)

import { getBackendURL, buildBackendHeaders } from '../talk/llm.js';
import { fetchBackend } from '../../core/backend-fetch.js';
import { recordDataSent, updateDataSentOutcome, DATA_SENT_REQUEST_TYPES } from '../talk/data-sent-log.js';
import { dayState } from '../../state.js';

// Дефолтные тексты для fallback
const DEFAULT_FEED_TEXTS = {
  quickAdvice: 'Aim for 7–8h sleep tonight.',
  nutritionInsight: 'Add protein to breakfast for a steadier morning.',
  tip: 'Obrium will show helpful notes here later.'
};

// Состояние загрузки AI-советов
let aiAdviceLoading = false;
let lastAiAdviceTime = null;
let cachedAdvice = null;
const AI_ADVICE_CACHE_MS = 5 * 60 * 1000; // Кэш на 5 минут

/**
 * Собирает profileState и dayState для отправки в AI
 */
function collectStateForAI() {
  let today = null;
  try {
    today = dayState.loadDayStateForToday();
  } catch (_) {
    // Day state unavailable — send nothing for today.
  }

  // Only values the user actually logged today; anything missing is omitted, never defaulted.
  const day = {};
  const sleepHours = Number(today?.sleep?.hours);
  if (today?.sleep?.hours != null && Number.isFinite(sleepHours) && sleepHours > 0) day.sleepLastNight = sleepHours;
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
    profileState: {},
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

  try {
    aiAdviceLoading = true;
    const state = collectStateForAI();
    const dayKeys = Object.keys(state.dayState);
    const logEntry = recordDataSent({
      requestType: DATA_SENT_REQUEST_TYPES.FEED_ADVICE,
      trigger: 'automatic',
      dataCategoriesIncluded: [
        'profile: none',
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
    updateDataSentOutcome(logEntry.id, response.ok ? 'sent' : `sent — relay returned HTTP ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
    }

    const data = await response.json();
    lastAiAdviceTime = now;
    cachedAdvice = data; // Сохраняем в кэш

    return data;
  } catch (error) {
    return null; // Вернём null, чтобы использовать дефолтные тексты
  } finally {
    aiAdviceLoading = false;
  }
}

/**
 * Обновляет блоки Feed с AI-советами
 * Показывает loading состояние и обрабатывает ошибки
 */
export async function updateFeedWithAIAdvice() {
  // Получаем элементы
  const quickAdviceText = document.getElementById('quickAdviceText');
  const feedNutritionText = document.getElementById('feedNutritionText');
  const inspirationText = document.getElementById('inspirationText'); // optional (Tips block removed in Clean Slate)

  if (!quickAdviceText || !feedNutritionText) {
    return;
  }

  const loadingText = 'Loading...';

  // Сохраняем оригинальные тексты только если они ещё не сохранены
  if (quickAdviceText && !quickAdviceText.dataset.loading && !quickAdviceText.dataset.originalText) {
    quickAdviceText.dataset.originalText = quickAdviceText.textContent || DEFAULT_FEED_TEXTS.quickAdvice;
  }
  if (quickAdviceText && !quickAdviceText.dataset.loading) {
    quickAdviceText.textContent = loadingText;
    quickAdviceText.dataset.loading = 'true';
  }

  if (feedNutritionText && !feedNutritionText.dataset.loading && !feedNutritionText.dataset.originalText) {
    feedNutritionText.dataset.originalText = feedNutritionText.textContent || DEFAULT_FEED_TEXTS.nutritionInsight;
  }
  if (feedNutritionText && !feedNutritionText.dataset.loading) {
    feedNutritionText.textContent = loadingText;
    feedNutritionText.dataset.loading = 'true';
  }

  if (inspirationText && !inspirationText.dataset.loading && !inspirationText.dataset.originalText) {
    inspirationText.dataset.originalText = inspirationText.textContent || DEFAULT_FEED_TEXTS.tip;
  }
  if (inspirationText && !inspirationText.dataset.loading) {
    inspirationText.textContent = loadingText;
    inspirationText.dataset.loading = 'true';
  }

  // Получаем AI-советы
  const advice = await fetchAIAdvice();

  // Обновляем тексты
  if (advice) {
    const finalQuickAdvice = advice.quickAdvice || DEFAULT_FEED_TEXTS.quickAdvice;
    const finalNutritionInsight = advice.nutritionInsight || DEFAULT_FEED_TEXTS.nutritionInsight;
    const finalTip = advice.tip || DEFAULT_FEED_TEXTS.tip;

    if (quickAdviceText) {
      quickAdviceText.textContent = finalQuickAdvice;
      delete quickAdviceText.dataset.loading;
      delete quickAdviceText.dataset.originalText;
    }

    if (feedNutritionText) {
      feedNutritionText.textContent = finalNutritionInsight;
      delete feedNutritionText.dataset.loading;
      delete feedNutritionText.dataset.originalText;
    }

    if (inspirationText) {
      inspirationText.textContent = finalTip;
      delete inspirationText.dataset.loading;
      delete inspirationText.dataset.originalText;
    }
  } else {
    // Используем дефолтные тексты или восстанавливаем оригинальные

    if (quickAdviceText) {
      const fallbackText = quickAdviceText.dataset.originalText || DEFAULT_FEED_TEXTS.quickAdvice;
      quickAdviceText.textContent = fallbackText;
      delete quickAdviceText.dataset.loading;
      delete quickAdviceText.dataset.originalText;
    }

    if (feedNutritionText) {
      const fallbackText = feedNutritionText.dataset.originalText || DEFAULT_FEED_TEXTS.nutritionInsight;
      feedNutritionText.textContent = fallbackText;
      delete feedNutritionText.dataset.loading;
      delete feedNutritionText.dataset.originalText;
    }

    if (inspirationText) {
      const fallbackText = inspirationText.dataset.originalText || DEFAULT_FEED_TEXTS.tip;
      inspirationText.textContent = fallbackText;
      delete inspirationText.dataset.loading;
      delete inspirationText.dataset.originalText;
    }
  }
}

/**
 * Сбрасывает кэш AI-советов
 */
export function resetAIAdviceCache() {
  lastAiAdviceTime = null;
  cachedAdvice = null;
}

// Экспорт для глобального использования
window.updateFeedWithAIAdvice = updateFeedWithAIAdvice;
window.resetAIAdviceCache = resetAIAdviceCache;

