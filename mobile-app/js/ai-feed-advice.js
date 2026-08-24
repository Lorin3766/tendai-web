// Serron — AI Feed Advice Module
// @owner: feed
// @role: utils
// Unified AI advice for Feed blocks (Quick advice, Nutrition insight, Tips)

const BACKEND_URL = 'http://localhost:3000';

// Дефолтные тексты для fallback
const DEFAULT_FEED_TEXTS = {
  quickAdvice: 'Aim for 7–8h sleep tonight.',
  nutritionInsight: 'Add protein to breakfast for a steadier morning.',
  tip: 'TendAI will show helpful notes here later.'
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
  // Импортируем state динамически
  let dayStateData = null;
  let userProfile = null;
  let userMetrics = null;

  try {
    // Пытаемся получить данные из state.js
    if (window.dayState) {
      dayStateData = window.dayState.loadDayStateForToday();
    }
    if (window.userProfile) {
      userProfile = window.userProfile;
    }
    if (window.userMetrics) {
      userMetrics = window.userMetrics;
    }
  } catch (e) {
    // Could not access state
  }

  // Пытаемся получить hydration из UI (dayStatWater показывает "6 / 8")
  let hydrationLogged = 6; // Дефолтное значение
  try {
    const waterEl = document.getElementById('dayStatWater');
    if (waterEl && waterEl.textContent) {
      const match = waterEl.textContent.match(/(\d+)\s*\/\s*\d+/);
      if (match) {
        hydrationLogged = parseInt(match[1], 10);
      }
    }
  } catch (e) {
    // Could not parse hydration from UI
  }

  // Собираем dayState из текущих данных
  const dayState = {
    sleepLastNight: dayStateData?.sleep?.hours || userProfile?.sleepHours || 7.2,
    hydrationLogged: dayStateData?.water?.current || hydrationLogged,
    moodToday: (() => {
      if (dayStateData?.energy) {
        const energy = dayStateData.energy.toLowerCase();
        if (energy.includes('great') || energy.includes('very high')) return 'Great';
        if (energy.includes('good') || energy.includes('high')) return 'Good';
        if (energy.includes('normal') || energy.includes('medium')) return 'Normal';
        return 'Low';
      }
      if (userMetrics) {
        const avgScore = (userMetrics.sleepScore + userMetrics.stressScore + userMetrics.activityScore) / 3;
        if (avgScore >= 75) return 'Great';
        if (avgScore >= 50) return 'Good';
        if (avgScore >= 25) return 'Normal';
        return 'Low';
      }
      return 'Good';
    })()
  };

  // profileState - собираем из доступных данных
  const profileState = userProfile || {
    age: null,
    gender: null,
    sleepHours: dayStateData?.sleep?.hours || null,
    sleepQuality: null,
    stressLevel: dayStateData?.stressLevel || null,
    foodQuality: null,
    activeDays: null,
    stepCategory: null,
    bodyGoal: null,
    healthGoal: null,
    mindGoal: null
  };

  const state = {
    profileState: profileState,
    dayState: dayState
  };

  return state;
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

    const response = await fetch(`${BACKEND_URL}/api/feed-advice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(state)
    });

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
  const inspirationText = document.getElementById('inspirationText');

  // Проверяем, что все элементы существуют
  if (!quickAdviceText || !feedNutritionText || !inspirationText) {
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

