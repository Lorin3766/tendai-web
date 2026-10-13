// Serron — Per-agent refresh hook for Feed cards (analyze)
// @owner: feed
// @role: effects

import { invalidateWeatherCache } from '../storage/weather-service.js';
import { findUserAgentByDisplayName } from '../human-os/user-agents.js';
import { runModularAgentRefreshForDisplayName } from '../human-os/modular-agents-runtime.js';

if (typeof window !== 'undefined' && !window.__obriumAgentAnalyzeHandlers) {
  window.__obriumAgentAnalyzeHandlers = {};
}

function isEnvironmentalAgentName(name) {
  return /(weather|scout|uv|wind|thermal|outdoor|environment|smog|aqi)/i.test(String(name || ''));
}

/**
 * Run agent-specific refresh. Environmental agents invalidate weather cache; others use
 * `window.__obriumAgentAnalyzeHandlers[name]` if set, else full `updateFeedUI`.
 * @param {string} agentName
 */
export async function runAgentCardAnalyze(agentName) {
  const name = String(agentName || '').trim();
  if (!name) return;

  const ua = findUserAgentByDisplayName(name);
  if (ua?.blueprintId) {
    await runModularAgentRefreshForDisplayName(name, { force: true });
    if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
    if (typeof window.updateFeedUI === 'function') await window.updateFeedUI();
    return;
  }

  if (isEnvironmentalAgentName(name)) {
    invalidateWeatherCache();
    if (typeof window.refreshWeatherCard === 'function') {
      await window.refreshWeatherCard();
    } else if (typeof window.updateFeedUI === 'function') {
      await window.updateFeedUI();
    }
    return;
  }

  const handlers = typeof window !== 'undefined' ? window.__obriumAgentAnalyzeHandlers : null;
  if (handlers && typeof handlers[name] === 'function') {
    await handlers[name]();
    return;
  }

  if (typeof window.updateFeedUI === 'function') {
    await window.updateFeedUI();
  }
}
