// Serron — Talk user memory (persistent LocalStorage)
// @owner: talk
// @role: memory

const USER_MEMORY_KEY = 'tendai_user_memory_v1';
const MAX_INSIGHTS = 16;

function defaultMemory() {
  return {
    updatedAt: null,
    insights: [],
  };
}

function normalizeInsight(value) {
  const v = String(value || '').trim();
  return v ? v : null;
}

export function getUserMemory() {
  try {
    const raw = localStorage.getItem(USER_MEMORY_KEY);
    if (!raw) return defaultMemory();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultMemory();
    const insights = Array.isArray(parsed.insights) ? parsed.insights.map(normalizeInsight).filter(Boolean) : [];
    return {
      updatedAt: parsed.updatedAt || null,
      insights: insights.slice(0, MAX_INSIGHTS),
    };
  } catch (_) {
    return defaultMemory();
  }
}

export function setUserMemory(memory) {
  const next = {
    ...defaultMemory(),
    ...(memory && typeof memory === 'object' ? memory : {}),
  };
  next.insights = Array.isArray(next.insights)
    ? next.insights.map(normalizeInsight).filter(Boolean).slice(0, MAX_INSIGHTS)
    : [];
  next.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(USER_MEMORY_KEY, JSON.stringify(next));
  } catch (_) {}
  return next;
}

export function addUserMemoryInsight(insight) {
  const v = normalizeInsight(insight);
  if (!v) return getUserMemory();
  const mem = getUserMemory();
  const without = mem.insights.filter((x) => x.toLowerCase() !== v.toLowerCase());
  without.unshift(v);
  return setUserMemory({ ...mem, insights: without.slice(0, MAX_INSIGHTS) });
}

/**
 * Lightweight heuristics to accumulate long-term user preferences.
 * @param {string} text
 */
export function learnFromUserMessage(text) {
  const t = String(text || '');
  if (!t.trim()) return getUserMemory();
  if (/\b(clean data|structured|concise|just facts)\b/i.test(t)) {
    addUserMemoryInsight('Likes clean data');
  }
  if (/\b(evening walk|walk in the evening|evening steps)\b/i.test(t)) {
    addUserMemoryInsight('Prefers walking in the evening');
  }
  return getUserMemory();
}

export function rememberFastAlertResponse() {
  return addUserMemoryInsight('Responds quickly to red alerts');
}

export function clearUserMemory() {
  return setUserMemory({ insights: [] });
}

export function removeUserMemoryInsightsByPrefix(prefix) {
  const p = String(prefix || '').trim().toLowerCase();
  if (!p) return getUserMemory();
  const mem = getUserMemory();
  const insights = mem.insights.filter((x) => !String(x).toLowerCase().startsWith(p));
  return setUserMemory({ ...mem, insights });
}

