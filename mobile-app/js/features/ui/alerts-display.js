// Serron — Alerts display (event-driven UI bridge for biometric status)

import { evaluateDailyMetrics } from '../agents/agent-engine.js';

const BIOMETRICS_EVENT_NAME = 'biometricsUpdated';
const ALERT_CLASS = 'system-alert-card';
const ALERT_EXIT_CLASS = 'is-exiting';
const ALERT_TEXT = '[ System Alert: Training protocol canceled due to recovery deficit ]';

function getAlertHost() {
  return (
    document.getElementById('feed-view') ||
    document.getElementById('talk-view') ||
    document.body
  );
}

function removeExistingAlerts(host) {
  if (!host) return;
  host.querySelectorAll(`.${ALERT_CLASS}`).forEach((node) => node.remove());
}

function removeCardWithFade(card) {
  if (!card || card.classList.contains(ALERT_EXIT_CLASS)) return;
  card.classList.add(ALERT_EXIT_CLASS);
  const remove = () => card.remove();
  card.addEventListener('animationend', remove, { once: true });
  setTimeout(remove, 260);
}

function createAlertCard() {
  const card = document.createElement('article');
  card.className = `card-soft ${ALERT_CLASS}`;
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');

  card.innerHTML = `
    <div class="system-alert-content">
      <p class="system-alert-text">${ALERT_TEXT}</p>
      <div class="system-alert-actions">
        <button type="button" class="system-alert-btn" data-alert-action="approve">[ APPROVE ]</button>
        <button type="button" class="system-alert-btn" data-alert-action="reject">[ REJECT ]</button>
      </div>
    </div>
  `;

  card.addEventListener('click', (event) => {
    const actionButton = event.target && event.target.closest('[data-alert-action]');
    if (!actionButton) return;
    removeCardWithFade(card);
  });

  return card;
}

function onBiometricsUpdated(event) {
  const payload = event && event.detail ? event.detail : null;
  const metrics = payload && payload.metrics ? payload.metrics : null;
  const evaluation = evaluateDailyMetrics(metrics);

  if (evaluation.status !== 'CRITICAL') return;

  const host = getAlertHost();
  removeExistingAlerts(host);

  const alertCard = createAlertCard();
  host.prepend(alertCard);
}

export function initAlertsDisplay() {
  if (window.__SERRON_ALERTS_DISPLAY_BOUND__) return;
  window.__SERRON_ALERTS_DISPLAY_BOUND__ = true;
  window.addEventListener(BIOMETRICS_EVENT_NAME, onBiometricsUpdated);
}
