// Serron — Minimal Feed Starter Cards
// @owner: feed
// @role: ui
// Shows simple cards from quick-setup data to keep feed non-empty without network calls

// CRITICAL: Block feed-starter in unified mode (hard block, not detection)
if (typeof window !== 'undefined' && window.__serronRunMode === 'unified') {
  window.__feedStarterBlocked = true;
  // No exports, no DOM operations, no timers, no side effects
  // All functions below are no-ops in unified mode
}

// FEED v3 — Morning Brief flow
const QS_STORAGE_KEY = 'tendai_quick_setup_v1';
const CHECKIN_STORAGE_KEY = 'feed_checkin_v3';
const CHECKIN_FLOW_STATE_KEY = 'checkin_flow_state_v1';
const CHECKIN_HISTORY_KEY = 'checkin_history_v1';
const FEED_INBOX_KEY = 'feed_inbox_items_v1';
const FEED_LAST_VISIT_KEY = 'feed_last_visit_v1';
const SHOW_MORNING_WEATHER = false; // legacy flag (unused in v3)

/** STRICT MVP: No image preload — gradients only. 0 network errors. */
let nebulaReady = true;
let nebulaLoading = false;

function preloadNebulaAssets(onReady) {
  onReady?.();
}

function loadQuickSetupState() {
  try {
    const raw = localStorage.getItem(QS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // normalize fields
    const primaryFocus = (parsed.primaryFocus || parsed.priority || '').toLowerCase();
    const secondaryFocus = (parsed.secondaryFocus || '').toLowerCase();
    const time = typeof parsed.time === 'number' ? parsed.time : 10;
    return {
      primaryFocus: primaryFocus || 'energy',
      secondaryFocus: secondaryFocus || '',
      time,
    };
  } catch (_e) {
    return null;
  }
}

const FOCUS_LABELS = {
  energy: 'Energy',
  sleep: 'Sleep',
  calm: 'Calm',
  longevity: 'Longevity',
  balance: 'Balance',
};

function formatFocus(state) {
  const mainRaw = state.primaryFocus || '';
  const main = FOCUS_LABELS[mainRaw] || capitalize(mainRaw) || 'Energy';
  const secondaryRaw =
    state.secondaryFocus && state.secondaryFocus !== 'balance' ? state.secondaryFocus : '';
  const secondary = secondaryRaw ? (FOCUS_LABELS[secondaryRaw] || capitalize(secondaryRaw)) : '';
  return secondary ? `${main} + ${secondary}` : main;
}

function capitalize(str = '') {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildCard(title, content, extra = '') {
  const card = document.createElement('article');
  card.className = 'card-soft feed-card';
  const h3 = document.createElement('h3');
  h3.className = 'card-title';
  h3.textContent = title;
  const p = document.createElement('p');
  p.className = 'card-body-text';
  p.textContent = content;
  card.appendChild(h3);
  card.appendChild(p);
  if (extra) {
    const small = document.createElement('div');
    small.className = 'card-meta';
    small.textContent = extra;
    card.appendChild(small);
  }
  return card;
}

function renderFeedStarter(state) {
  // Hard block in unified (already checked at top, but double-check)
  if (typeof window !== 'undefined' && window.__feedStarterBlocked) {
    return; // Early return: no markers, no side effects
  }
  
  // Mark that feed-starter ran (for DEV guard) - only if NOT blocked and actually rendering
  if (typeof window !== 'undefined') {
    window.__feedStarterRan = true;
  }
  
  if (!window.__feedRenderCount) window.__feedRenderCount = 0;
  window.__feedRenderCount++;
  if (window.__feedRenderCount <= 20) {
    console.log(
      '[FEED][RENDER]',
      window.__feedRenderCount,
      'at',
      Date.now(),
      new Error().stack.split('\n').slice(0, 6).join('\n')
    );
  }
  const feedView = document.getElementById('feed-view');
  if (!feedView) return;

  // Record visit for "away" logic
  const nowIso = new Date().toISOString();
  const lastVisitRaw = localStorage.getItem(FEED_LAST_VISIT_KEY);
  const inbox = ensureInbox(nowIso, lastVisitRaw);
  localStorage.setItem(FEED_LAST_VISIT_KEY, nowIso);
  syncUnreadBadgesFeedOnly(inbox);

  // Kick off preload (nebula is optional)
  if (!nebulaReady && !nebulaLoading) {
    preloadNebulaAssets(() => {
      if (!feedView.dataset.feedTheme) feedView.dataset.feedTheme = 'nebula';
    }, () => {
      feedView.removeAttribute('data-feed-theme');
    });
  }
  if (nebulaReady && !feedView.dataset.feedTheme) {
    feedView.dataset.feedTheme = 'nebula';
  }
  if (!nebulaReady) {
    feedView.removeAttribute('data-feed-theme');
  }

  // Sanitize: keep only list container
  const orphanUnread = feedView.querySelector('#unread-feed-section');
  if (orphanUnread) orphanUnread.remove();
  // Remove any legacy hydration cards
  feedView.querySelectorAll('[data-category="hydration"], .hydration, .hydration-card').forEach((node) => node.remove());
  Array.from(feedView.children).forEach(child => {
    if (child.id !== 'feedCardList') child.remove();
  });

  let list = document.getElementById('feedCardList');
  if (!list) {
    list = document.createElement('div');
    list.id = 'feedCardList';
    list.className = 'feed-card-list';
    feedView.appendChild(list);
  }
  // Mark that this container was rendered by feed-starter (for DEV guard)
  // Only set if we actually rendered (not blocked in unified)
  list.setAttribute('data-rendered-by', 'feed-starter');
  list.innerHTML = '';

  // Card 1: Good morning + Weather Brief
  const weatherCard = buildWeatherCard();
  list.appendChild(weatherCard);

  // Card 2+: Inbox items (actionable/informational)
  buildInboxCards(list, inbox);

  // Card 3: Goal-based recommendation
  const goalCard = buildGoalCard(state);
  list.appendChild(goalCard);

  // Card 4: Small Win / Calm Insight
  const progressCard = buildProgressCard(state);
  list.appendChild(progressCard);

  // Card 5: Bridge to Talk
  const bridgeCard = buildBridgeCard(state);
  list.appendChild(bridgeCard);

  // Log only in non-unified mode
  if (window.__serronRunMode !== 'unified') {
    console.log(`FEED STARTER: rendered 5 cards; Nebula ready: ${nebulaReady}`);
  }
}

function refreshFeedStarter() {
  // Hard block in unified
  if (typeof window !== 'undefined' && window.__feedStarterBlocked) {
    return;
  }
  
  const state = loadQuickSetupState();
  if (!state) return;
  const stateKey = buildFeedRenderKey(state);
  if (stateKey === lastRenderKey) return;
  lastRenderKey = stateKey;
  renderFeedStarter(state);
}

let lastRenderKey = '';

function buildFeedRenderKey(state) {
  const quickKey = {
    primaryFocus: state?.primaryFocus || '',
    secondaryFocus: state?.secondaryFocus || '',
    time: state?.time || 0
  };
  let flowKey = null;
  try {
    const flow = loadFlowState();
    if (flow) {
      flowKey = {
        type: flow.type || '',
        status: flow.status || '',
        step: flow.step ?? null,
        inboxId: flow.inboxId || ''
      };
    }
  } catch (_e) {}
  let checkinKey = null;
  try {
    const checkin = getCheckinState();
    if (checkin) {
      checkinKey = {
        status: checkin.status || '',
        step: checkin.step ?? null
      };
    }
  } catch (_e) {}
  let inboxSig = '';
  try {
    const raw = localStorage.getItem(FEED_INBOX_KEY);
    if (raw) {
      const items = JSON.parse(raw) || [];
      inboxSig = items.map(item => `${item.id}:${item.status}:${item.subtype}`).join('|');
    }
  } catch (_e) {}
  return JSON.stringify({ quickKey, flowKey, checkinKey, inboxSig });
}

// ---------- Card builders ----------

function buildWeatherCard() {
  const card = document.createElement('article');
  card.className = 'card-soft feed-card card-weather day-context';

  const header = document.createElement('div');
  header.className = 'card-header-row';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = 'Good morning, Anton';

  const datetime = document.createElement('div');
  datetime.className = 'card-datetime';
  header.appendChild(title);
  header.appendChild(datetime);
  card.appendChild(header);

  const { weatherLine, details } = getWeatherBrief();

  const todayLine = document.createElement('div');
  todayLine.className = 'card-body-text';
  todayLine.textContent = weatherLine;
  card.appendChild(todayLine);

  const detailsToggle = document.createElement('button');
  detailsToggle.type = 'button';
  detailsToggle.className = 'details-toggle';
  detailsToggle.textContent = 'Details';

  const detailsBlock = document.createElement('div');
  detailsBlock.className = 'details-block hidden';
  details.forEach((line) => {
    const d = document.createElement('div');
    d.className = 'card-meta';
    d.textContent = line;
    detailsBlock.appendChild(d);
  });

  detailsToggle.addEventListener('click', () => {
    const isHidden = detailsBlock.classList.toggle('hidden');
    detailsToggle.textContent = isHidden ? 'Details' : 'Hide details';
  });

  card.appendChild(detailsToggle);
  card.appendChild(detailsBlock);

  startDateTimeTicker(datetime);

  return card;
}

function buildInboxCards(list, inbox = []) {
  const sorted = [...inbox].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  sorted.forEach((item) => {
    if (item.subtype === 'digest_away') {
      list.appendChild(buildDigestCard(item));
    } else if (item.subtype === 'checkin_morning' || item.subtype === 'checkin_evening') {
      list.appendChild(buildCheckinInviteCard(item));
    }
  });
}

function buildCheckinInviteCard(item) {
  const isMorning = item.subtype === 'checkin_morning';
  const card = buildCard(isMorning ? 'Morning check-in' : 'Evening check-in', '');
  card.classList.add('card-checkin');

  const timeRow = document.createElement('div');
  timeRow.className = 'card-meta';
  timeRow.textContent = `Sent: ${formatInboxTime(item.timestamp)}`;

  const line = document.createElement('div');
  line.className = 'card-body-text';
  line.textContent = 'Want a quick check-in?';

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = isMorning
    ? 'One question → one clear step for today.'
    : 'One question → a clear close for today.';

  const actions = document.createElement('div');
  actions.className = 'chip-row';

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'btn';
  start.textContent = 'Start';
  start.setAttribute('data-action', 'checkin-start');
  start.setAttribute('data-checkin-id', item.id);
  start.setAttribute('data-checkin-type', isMorning ? 'morning' : 'evening');
  start.addEventListener('click', () => {
    markInboxItem(item.id, 'in_progress');
    syncUnreadBadges();
    startCheckinOverlay(isMorning ? 'morning' : 'evening', item.id);
  });

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn ghost';
  skip.textContent = 'Skip';
  skip.setAttribute('data-action', 'checkin-skip');
  skip.setAttribute('data-checkin-id', item.id);
  skip.addEventListener('click', () => {
    markInboxItem(item.id, 'dismissed');
    syncUnreadBadges();
    refreshFeedStarter();
  });

  actions.appendChild(start);
  actions.appendChild(skip);

  card.appendChild(timeRow);
  card.appendChild(line);
  card.appendChild(meta);
  card.appendChild(actions);
  return card;
}

function buildDigestCard(item) {
  const card = buildCard('While you were away', '');
  card.classList.add('card-checkin');

  const timeRow = document.createElement('div');
  timeRow.className = 'card-meta';
  timeRow.textContent = `Sent: ${formatInboxTime(item.timestamp)}`;

  const line = document.createElement('div');
  line.className = 'card-body-text';
  line.textContent = item.text || 'You missed a few check-ins.';

  const actions = document.createElement('div');
  actions.className = 'chip-row';

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'btn';
  open.textContent = 'Open';
  open.addEventListener('click', () => {
    markInboxItem(item.id, 'read');
    syncUnreadBadges();
    if (window.switchView) {
      window.switchView('talk');
    } else {
      document.getElementById('tab-talk')?.click();
    }
  });

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn ghost';
  skip.textContent = 'Dismiss';
  skip.addEventListener('click', () => {
    markInboxItem(item.id, 'dismissed');
    syncUnreadBadges();
    refreshFeedStarter();
  });

  actions.appendChild(open);
  actions.appendChild(skip);

  card.appendChild(timeRow);
  card.appendChild(line);
  card.appendChild(actions);
  return card;
}

function buildGoalCard(state) {
  const card = buildCard('Goal suggestion', '');
  card.classList.add('card-goal');

  const hasGoal = Boolean(state?.primaryFocus);
  const answers = getCheckinState().answers || {};
  const body = document.createElement('div');
  body.className = 'card-body-text';
  body.textContent = hasGoal
    ? goalSuggestionText(state, answers)
    : 'Pick a focus for this week';
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'chip-row';

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'btn ghost';
  action.textContent = hasGoal ? 'Do it today' : 'Choose focus';
  action.addEventListener('click', () => {
    if (!hasGoal && window.openQuickSetup) {
      window.openQuickSetup();
    }
    if (hasGoal && window.switchView) {
      window.switchView('talk');
    }
  });
  actions.appendChild(action);

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn ghost subtle';
  skip.textContent = 'Not now';
  skip.addEventListener('click', () => {
    card.classList.add('is-done');
  });
  actions.appendChild(skip);

  card.appendChild(actions);
  return card;
}

function buildProgressCard(state) {
  const card = buildCard('Small win', '');
  card.classList.add('card-progress');

  const badge = document.createElement('div');
  badge.className = 'progress-badge';
  badge.textContent = 'steady';

  const line = document.createElement('div');
  line.className = 'card-body-text';
  line.textContent = progressLine(state);

  card.appendChild(badge);
  card.appendChild(line);
  return card;
}

function buildBridgeCard(state) {
  const card = buildCard('Bridge to Talk', '');
  card.classList.add('card-bridge');

  const reason = document.createElement('div');
  reason.className = 'card-body-text';
  const answers = getCheckinState().answers || {};
  reason.textContent = bridgeReason(state, answers);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = 'Open Talk';
  btn.addEventListener('click', () => {
    if (window.switchView) {
      window.switchView('talk');
    } else {
      const tab = document.getElementById('tab-talk');
      tab?.click();
    }
  });

  card.appendChild(reason);
  card.appendChild(btn);
  return card;
}

function formatDateToday() {
  try {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
    const month = now.toLocaleDateString('en-US', { month: 'short' });
    const day = now.toLocaleDateString('en-US', { day: 'numeric' });
    return `${weekday} • ${month} ${day}`;
  } catch (_e) {
    return 'Today';
  }
}

function getWeatherText() {
  const weatherEl = document.getElementById('dayHeaderWeather');
  const pressureEl = document.getElementById('dayHeaderPressure');
  const weather = weatherEl?.textContent?.trim();
  const pressure = pressureEl?.textContent?.trim();
  if (weather) {
    return `Weather: ${weather}`;
  }
  if (pressure) {
    return `Pressure: ${pressure}`;
  }
  return 'Weather: — (not set)';
}

// ---------- Helpers ----------

/** Weather brief: from Glance (Now) + Details block; no tips or advice. */
function getWeatherBrief() {
  const nowEl = document.getElementById('dayHeaderWeatherNow');
  const todayEl = document.getElementById('dayHeaderWeatherToday');
  const windEl = document.getElementById('dayHeaderWeatherWind');
  const raw = nowEl?.textContent?.trim() || '';
  const details = [];
  if (todayEl?.textContent?.trim()) details.push(todayEl.textContent.trim());
  if (windEl?.textContent?.trim()) details.push(windEl.textContent.trim());
  const detailsBlock = document.getElementById('dayHeaderWeatherDetailsBlock');
  if (detailsBlock && !detailsBlock.hidden) {
    const humidityEl = document.getElementById('dayHeaderWeatherHumidity');
    const pressureEl = document.getElementById('dayHeaderWeatherPressure');
    if (humidityEl?.textContent?.trim()) details.push(humidityEl.textContent.trim());
    if (pressureEl?.textContent?.trim()) details.push(pressureEl.textContent.trim());
  }

  const weatherLine = buildWeatherLine(raw);
  return { weatherLine, details };
}

function buildWeatherLine(raw = '') {
  if (!raw) return 'Weather: loading…';
  const base = raw.replace(/^today:\s*/i, '').replace(/^weather:\s*/i, '').trim();
  const lowerBase = base.toLowerCase();
  if (!base || lowerBase.includes('no data') || lowerBase.includes('steady weather')) {
    return 'Weather: loading…';
  }
  const tempMatch = raw.match(/-?\d+\s?°[cf]?/i)?.[0] || '';
  const wind = extractMetric(raw, 'wind');
  const precip = extractPrecip(raw);
  const parts = [tempMatch, wind, precip].filter(Boolean);
  const line = parts.length ? parts.join(' • ') : base;
  return `Today: ${line || base || '—'}`;
}

function buildWeatherTip(raw = '') {
  if (!raw) return 'Tip: Dress in layers if you’re going out.';
  const base = raw.replace(/^today:\s*/i, '').replace(/^weather:\s*/i, '').trim().toLowerCase();
  if (!base || base.includes('no data') || base.includes('steady weather')) {
    return 'Tip: Dress in layers if you’re going out.';
  }
  const lower = raw.toLowerCase();
  const tempMatch = raw.match(/-?\d+/);
  const tempVal = tempMatch ? parseInt(tempMatch[0], 10) : null;

  if (lower.includes('storm') || lower.includes('thunder')) {
    return 'Tip: Stay dry — keep an umbrella handy.';
  }
  if (lower.includes('snow') || lower.includes('ice') || lower.includes('sleet')) {
    return 'Tip: Watch for ice — wear shoes with grip.';
  }
  if (lower.includes('rain') || lower.includes('drizzle')) {
    return 'Tip: Take a warm jacket — bring an umbrella later.';
  }
  if (lower.includes('wind')) {
    return 'Tip: Add a windproof layer or hoodie.';
  }
  if (tempVal !== null && tempVal <= 5) {
    return 'Tip: Wear a warm jacket and consider gloves.';
  }
  if (tempVal !== null && tempVal >= 28) {
    return 'Tip: Go light — breathable layers and water.';
  }
  return 'Tip: Dress in layers if you’re going out.';
}

function extractPrecip(raw = '') {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.includes('snow')) return 'snow';
  if (lower.includes('rain')) return 'rain';
  if (lower.includes('sleet')) return 'sleet';
  const chance = extractMetric(raw, 'chance');
  return chance;
}

// ---------- Inbox helpers ----------

function ensureInbox(nowIso, lastVisitRaw) {
  const inbox = loadInbox();
  const now = nowIso ? new Date(nowIso) : new Date();
  const todayKey = now.toISOString().split('T')[0];
  const lastVisit = lastVisitRaw ? new Date(lastVisitRaw) : null;
  const daysAway = lastVisit ? Math.floor((now - lastVisit) / 86400000) : 0;

  // Compress old pending check-ins into one digest if away >= 3 days
  if (daysAway >= 3 && !inbox.find((i) => i.subtype === 'digest_away' && i.status === 'unread')) {
    const missedMorning = Math.max(daysAway, 1);
    const missedEvening = Math.max(daysAway - 1, 0);
    addOrRefreshInboxItem({
      id: `digest_away_${todayKey}`,
      subtype: 'digest_away',
      text: `You missed ${missedMorning} morning and ${missedEvening} evening check-ins.`,
      actionable: true,
    }, inbox);
  }

  // Add current check-in invitation (morning/evening)
  // Ensure both morning and evening check-ins exist for today
  addOrRefreshInboxItem({
    id: `checkin_morning_${todayKey}`,
    subtype: 'checkin_morning',
    text: 'Morning check-in',
    actionable: true,
    dateKey: todayKey,
  }, inbox);

  addOrRefreshInboxItem({
    id: `checkin_evening_${todayKey}`,
    subtype: 'checkin_evening',
    text: 'Evening check-in',
    actionable: true,
    dateKey: todayKey,
  }, inbox);

  saveInbox(inbox);
  return inbox;
}

function loadInbox() {
  try {
    const raw = localStorage.getItem(FEED_INBOX_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_e) {
    return [];
  }
}

function saveInbox(items) {
  try {
    localStorage.setItem(FEED_INBOX_KEY, JSON.stringify(items));
  } catch (_e) {
    // ignore
  }
}

function addOrRefreshInboxItem(item, inbox) {
  const existing = inbox.find((i) => i.id === item.id);
  if (existing) {
    existing.timestamp = existing.timestamp || new Date().toISOString();
    existing.status = existing.status || 'unread';
    return existing;
  }
  inbox.push({
    id: item.id,
    subtype: item.subtype,
    text: item.text,
    actionable: Boolean(item.actionable),
    status: item.status || 'unread',
    timestamp: new Date().toISOString(),
    dateKey: item.dateKey,
  });
  return item;
}

function markInboxItem(id, status) {
  const inbox = loadInbox();
  const target = inbox.find((i) => i.id === id);
  if (target) {
    target.status = status;
    if (status === 'completed') {
      target.completedAt = new Date().toISOString();
    }
    saveInbox(inbox);
  }
  syncUnreadBadges(inbox);
}

/** FEED: no unread badges — mark all feed items as read so Feed tab has no "debt" indicator. */
function syncUnreadBadgesFeedOnly(inbox) {
  const items = inbox || loadInbox();
  const markRead = window.markItemAsRead || window.markItemAsReadUnreadItem || window.markItemAsReadFromBadge;
  items.forEach((item) => markRead?.(item.id));
  window.updateAllBadgeCounts?.();
}

function syncUnreadBadges(inbox) {
  syncUnreadBadgesFeedOnly(inbox);
}

function formatInboxTime(ts) {
  if (!ts) return '';
  try {
    const date = new Date(ts);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${month} ${day} • ${hours}:${minutes} ${ampm}`;
  } catch (_e) {
    return '';
  }
}

function formatNowHeader() {
  // Clear, non-ambiguous header: “Today: Thu · Jan 15”
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const day = now.getDate();
  return `Today: ${weekday} · ${month} ${day}`;
}

function startDateTimeTicker(el) {
  if (!el) return;
  const update = () => {
    if (!el.isConnected) return;
    el.textContent = formatNowHeader();
    const now = new Date();
    const msToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    setTimeout(update, msToNextMinute);
  };
  update();
}

// Legacy date line for subtitle formatting

// ---------- FEED overlay check-in flow ----------

const CHECKIN_FLOW_TYPES = {
  morning: 'Morning check-in',
  evening: 'Evening check-in'
};

function startCheckinOverlay(type = 'morning', inboxId) {
  const existing = loadFlowState();
  const flow = existing && existing.type === type && existing.status === 'in_progress'
    ? existing
    : {
        type,
        status: 'in_progress',
        step: 0,
        answers: {},
        inboxId: inboxId || `${type}_${new Date().toISOString().split('T')[0]}`
      };
  saveFlowState(flow);
  markInboxItem(flow.inboxId, 'in_progress');
  syncUnreadBadges();
  openOverlay();
  renderOverlay();
}

function resumeCheckinOverlayIfNeeded() {
  const flow = loadFlowState();
  if (flow && flow.status === 'in_progress') {
    openOverlay();
    renderOverlay();
  }
}

function loadFlowState() {
  try {
    const raw = localStorage.getItem(CHECKIN_FLOW_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

function saveFlowState(state) {
  try {
    localStorage.setItem(CHECKIN_FLOW_STATE_KEY, JSON.stringify(state));
  } catch (_e) {
    // ignore
  }
}

function clearFlowState() {
  try {
    localStorage.removeItem(CHECKIN_FLOW_STATE_KEY);
  } catch (_e) {
    // ignore
  }
}

function openOverlay() {
  let overlay = document.getElementById('checkinOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'checkinOverlay';
    overlay.className = 'checkin-overlay';
    overlay.innerHTML = `
      <div class="checkin-overlay-backdrop"></div>
      <div class="checkin-overlay-card">
        <button class="checkin-close" aria-label="Close">×</button>
        <div class="checkin-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.checkin-close')?.addEventListener('click', closeOverlay);
  }
  document.body.classList.add('checkin-overlay-open');
  overlay.classList.add('is-visible');
}

function closeOverlay() {
  const overlay = document.getElementById('checkinOverlay');
  if (overlay) overlay.classList.remove('is-visible');
  document.body.classList.remove('checkin-overlay-open');
}

function renderOverlay() {
  const flow = loadFlowState();
  if (!flow || flow.status !== 'in_progress') return;
  const overlay = document.getElementById('checkinOverlay');
  const content = overlay?.querySelector('.checkin-content');
  if (!content) return;
  overlay.classList.add('is-visible');

  const steps = buildStepSequence(flow.type, flow.answers);
  const currentStep = steps[flow.step] || steps[steps.length - 1];
  const total = steps.length;

  content.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'checkin-header';
  header.textContent = `${CHECKIN_FLOW_TYPES[flow.type]} • ${flow.step + 1}/${total}`;
  content.appendChild(header);

  const title = document.createElement('div');
  title.className = 'checkin-question';
  title.textContent = currentStep.question;
  content.appendChild(title);

  if (currentStep.hint) {
    const hint = document.createElement('div');
    hint.className = 'checkin-hint';
    hint.textContent = currentStep.hint;
    content.appendChild(hint);
  }

  // Answers
  if (currentStep.type === 'dual') {
    const row1 = buildOptionRow(currentStep.optionsA, flow, currentStep, 'protein');
    const row2 = buildOptionRow(currentStep.optionsB, flow, currentStep, 'carbs');
    content.appendChild(row1);
    content.appendChild(row2);
  } else {
    const row = buildOptionRow(currentStep.options, flow, currentStep);
    content.appendChild(row);
  }

  // Footer
  const footerRow = document.createElement('div');
  footerRow.className = 'checkin-footer-row';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn ghost subtle';
  backBtn.textContent = 'Back';
  backBtn.disabled = flow.step === 0;
  backBtn.addEventListener('click', () => {
    if (flow.step > 0) {
      flow.step -= 1;
      saveFlowState(flow);
      renderOverlay();
    }
  });
  footerRow.appendChild(backBtn);

  if (currentStep.footer === 'not_sure' || currentStep.footer === 'skip') {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'checkin-footer-btn';
    link.textContent = currentStep.footer === 'not_sure' ? 'Not sure' : 'Skip';
    link.addEventListener('click', () => {
      handleAnswer(currentStep, currentStep.footer === 'not_sure' ? 'unknown' : 'skipped', flow, { dualKey: currentStep.secondaryKey });
    });
    footerRow.appendChild(link);
  }

  content.appendChild(footerRow);
}

function buildOptionRow(options, flow, step, dualKey) {
  const row = document.createElement('div');
  row.className = 'checkin-option-row';
  if (step.layout === 'water') {
    row.classList.add('water-options');
  }
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    const label = opt.label || opt;
    btn.innerHTML = typeof label === 'string' ? label : String(label);
    btn.addEventListener('click', () => {
      handleAnswer(step, opt.value || opt, flow, { dualKey });
    });
    row.appendChild(btn);
  });
  return row;
}

function handleAnswer(step, value, flow, opts = {}) {
  const answers = flow.answers || {};

  if (step.type === 'dual') {
    const dualKey = opts.dualKey === 'carbs' ? 'carbs' : 'protein';
    const existing = answers[step.id] || { protein: null, carbs: null };
    existing[dualKey] = value;
    answers[step.id] = existing;
    flow.answers = answers;
    saveFlowState(flow);
    const bothSet = existing.protein && existing.carbs;
    if (bothSet) {
      advanceFlow(flow);
    } else {
      renderOverlay();
    }
    return;
  }

  answers[step.id] = value;
  flow.answers = answers;
  saveFlowState(flow);
  advanceFlow(flow);
}

function advanceFlow(flow) {
  const steps = buildStepSequence(flow.type, flow.answers);
  const nextStep = flow.step + 1;
  if (nextStep >= steps.length) {
    completeCheckinFlow(flow);
  } else {
    flow.step = nextStep;
    saveFlowState(flow);
    renderOverlay();
  }
}

function buildStepSequence(type, answers = {}) {
  if (type === 'evening') {
    const base = [
      { id: 'e1_mood', question: 'How did you feel today overall?', options: ['Great', 'OK', 'Not great', 'Bad'], footer: 'not_sure' },
      {
        id: 'e2_water',
        question: 'Water today (approx.)?',
        options: [
          { value: '<0.5l', label: '<0.5 L<br>(<17 oz)' },
          { value: '0.5-1.0l', label: '0.5–1.0 L<br>(17–34 oz)' },
          { value: '1.0-1.5l', label: '1.0–1.5 L<br>(34–51 oz)' },
          { value: '1.5-2.0l', label: '1.5–2.0 L<br>(51–68 oz)' },
          { value: '2.0+l', label: '2.0+ L<br>(68+ oz)' }
        ],
        footer: 'not_sure',
        layout: 'water'
      },
      {
        id: 'e3_food',
        question: 'Food today (quick)',
        type: 'dual',
        optionsA: [{ value: 'protein_low', label: 'Protein: Low' }, { value: 'protein_ok', label: 'Protein: OK' }, { value: 'protein_high', label: 'Protein: High' }],
        optionsB: [{ value: 'carb_low', label: 'Carbs: Low' }, { value: 'carb_ok', label: 'Carbs: OK' }, { value: 'carb_high', label: 'Carbs: High' }],
        footer: 'not_sure'
      },
      { id: 'e4_steps', question: 'Steps today?', options: ['< 3k', '3–6k', '6–10k', '10–15k', '15k+'], footer: 'not_sure' },
      { id: 'e5_symptom', question: 'Any pain or symptoms today?', options: ['No', 'Yes'], footer: 'skip' }
    ];
    const seq = [...base];
    const symptom = (answers.e5_symptom || '').toLowerCase();
    if (symptom && symptom !== 'no' && symptom !== 'skipped' && symptom !== 'unknown') {
      seq.push({ id: 'e5_where', question: 'Where?', options: ['Head', 'Nose-throat', 'Stomach', 'Muscles-back', 'Other'], footer: 'skip' });
      seq.push({ id: 'e5_intensity', question: 'How strong?', options: ['Mild', 'Medium', 'Strong'], footer: 'skip' });
    }
    return seq;
  }

  // morning
  const base = [
    { id: 'm1_feel', question: 'How do you feel this morning?', options: ['Great', 'OK', 'Tired', 'Stressed', 'Tired + stressed'], footer: 'not_sure' },
    { id: 'm2_sleep_hours', question: 'How many hours did you sleep?', options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9+'], footer: 'not_sure' },
    { id: 'm3_sleep_quality', question: 'Sleep quality?', options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], hint: '0 = very bad, 9 = excellent', footer: 'not_sure' },
    { id: 'm4_body_signal', question: 'Any body signals today?', options: ['None', 'Head', 'Nose / throat', 'Stomach', 'Muscles / back', 'Other'], footer: 'skip' }
  ];
  const seq = [...base];
  const body = (answers.m4_body_signal || '').toLowerCase();
  if (body && body !== 'none' && body !== 'skipped' && body !== 'unknown') {
    seq.push({ id: 'm4_intensity', question: 'How strong is it?', options: ['Mild', 'Medium', 'Strong'], footer: 'skip' });
  }
  return seq;
}

function completeCheckinFlow(flow) {
  const now = new Date();
  const entry = {
    type: flow.type,
    answers: flow.answers,
    completedAt: now.toISOString(),
    dateKey: now.toISOString().split('T')[0]
  };
  saveCheckinHistory(entry);
  markInboxItem(flow.inboxId, 'completed');
  syncUnreadBadges();
  showSummaryCard(flow);
  clearFlowState();
}

function saveCheckinHistory(entry) {
  try {
    const raw = localStorage.getItem(CHECKIN_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push(entry);
    localStorage.setItem(CHECKIN_HISTORY_KEY, JSON.stringify(list));
  } catch (_e) {
    // ignore
  }
}

function showSummaryCard(flow) {
  const overlay = document.getElementById('checkinOverlay');
  const content = overlay?.querySelector('.checkin-content');
  if (!content) return;
  const summary = buildSummary(flow);

  content.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'checkin-header';
  header.textContent = 'Saved ✓';
  content.appendChild(header);

  const line = document.createElement('div');
  line.className = 'checkin-question';
  line.textContent = summary || 'Data saved.';
  content.appendChild(line);

  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'btn';
  done.textContent = 'Done';
  done.addEventListener('click', () => {
    closeOverlay();
    addSavedFeedEntry(flow, summary);
  });
  content.appendChild(done);
}

function buildSummary(flow) {
  const a = flow.answers || {};
  const parts = [];
  if (flow.type === 'morning') {
    if (a.m1_feel) parts.push(a.m1_feel);
    if (a.m2_sleep_hours) parts.push(`${a.m2_sleep_hours}h sleep`);
    if (a.m3_sleep_quality) parts.push(`sleep q:${a.m3_sleep_quality}`);
    if (a.m4_body_signal && a.m4_body_signal !== 'None') parts.push(`body: ${a.m4_body_signal}`);
  } else {
    if (a.e1_mood) parts.push(a.e1_mood);
    if (a.e2_water) parts.push(`water: ${a.e2_water}`);
    if (a.e3_food && a.e3_food.protein && a.e3_food.carbs) {
      parts.push(`food P:${a.e3_food.protein.replace('protein_', '')} C:${a.e3_food.carbs.replace('carb_', '')}`);
    }
    if (a.e4_steps) parts.push(`steps: ${a.e4_steps}`);
    if (a.e5_symptom) parts.push(`symptom: ${a.e5_symptom}`);
  }
  return parts.join(' • ').trim() || 'Check-in saved';
}

function addSavedFeedEntry(flow, summary) {
  const list = document.getElementById('feedCardList');
  if (!list) return;
  const card = buildCard(
    flow.type === 'morning' ? 'Morning check-in saved' : 'Evening check-in saved',
    summary || 'Saved'
  );
  card.classList.add('card-progress');
  card.classList.remove('is-unread');
  list.appendChild(card);
}

function goalSuggestionText(state, answers = {}) {
  const focus = (state.primaryFocus || '').toLowerCase();
  const energy = (answers.energy || '').toLowerCase();
  const stress = (answers.stress || '').toLowerCase();

  if (!focus) return 'Pick one focus for today.';

  // Branches by energy/stress
  if (energy === 'low' || energy === 'tired') {
    return 'Keep it light: one small move for your goal.';
  }
  if (stress === 'stressed' || stress === 'overloaded') {
    return 'Protect focus: pick one gentle action for your goal.';
  }
  if (energy === 'high' || energy === 'good') {
    return 'Leverage momentum: one focused action for your goal.';
  }
  if (energy === 'wired') {
    return 'Channel that energy into a short, clear task.';
  }

  // Fallback by goal focus
  switch (focus) {
    case 'energy':
      return 'One steady action to keep energy balanced.';
    case 'sleep':
      return 'Set a calm wind-down tonight for better sleep.';
    case 'calm':
      return 'Take a 3-minute pause to keep calm steady.';
    case 'longevity':
      return 'One gentle habit today supports your long game.';
    case 'balance':
      return 'Blend one light task with one break today.';
    default:
      return 'Pick one focus for today.';
  }
}

function progressLine(state) {
  const focus = (state.primaryFocus || '').toLowerCase();
  const answers = getCheckinState().answers || {};
  const energy = (answers.energy || '').toLowerCase();
  const stress = (answers.stress || '').toLowerCase();

  if (energy === 'low' || energy === 'tired') {
    return 'You showed up even with low energy — that’s progress.';
  }
  if (stress === 'stressed' || stress === 'overloaded') {
    return 'You protected your day under pressure.';
  }

  switch (focus) {
    case 'energy':
      return 'You kept a steady pace yesterday.';
    case 'sleep':
      return 'You protected your evening once this week.';
    case 'calm':
      return 'Your pauses are adding up.';
    case 'longevity':
      return 'Consistency builds your base.';
    case 'balance':
      return 'You’re balancing variety quietly.';
    default:
      return "You're building consistency.";
  }
}

function bridgeReason(state, answers = {}) {
  const energy = (answers.energy || '').toLowerCase();
  const stress = (answers.stress || '').toLowerCase();
  if (energy === 'low' || energy === 'tired') {
    return '1 minute: tell me your energy → I’ll adjust today’s focus';
  }
  if (stress === 'stressed' || stress === 'overloaded') {
    return 'Share how tense it feels → I’ll lighten your plan';
  }
  if (energy === 'high' || energy === 'good') {
    return 'Tell me your energy → I’ll help you channel it today';
  }
  return 'Tell me how you feel → I’ll shape today for you';
}

// ---------- Check-in state (per day) ----------

function getDayKey() {
  try {
    return new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (_e) {
    return new Date().toISOString().split('T')[0];
  }
}

function defaultCheckinState() {
  return { day: getDayKey(), status: 'pending', step: 0, answers: {} };
}

function getCheckinState() {
  try {
    const raw = localStorage.getItem(CHECKIN_STORAGE_KEY);
    if (!raw) return defaultCheckinState();
    const parsed = JSON.parse(raw);
    if (parsed.day !== getDayKey()) return defaultCheckinState();
    return { ...defaultCheckinState(), ...parsed };
  } catch (_e) {
    return defaultCheckinState();
  }
}

function saveCheckinState(next) {
  try {
    localStorage.setItem(CHECKIN_STORAGE_KEY, JSON.stringify(next));
  } catch (_e) {
    /* no-op */
  }
}

function startCheckin() {
  const next = { ...defaultCheckinState(), status: 'in_progress', step: 0 };
  saveCheckinState(next);
}

function snoozeCheckin() {
  const next = { ...defaultCheckinState(), status: 'snoozed' };
  saveCheckinState(next);
}

function resetCheckin() {
  saveCheckinState(defaultCheckinState());
}

const CHECKIN_STEPS = [
  { id: 'energy', label: 'Energy', options: ['Low', 'OK', 'Good', 'High', 'Wired'] },
  { id: 'stress', label: 'Stress', options: ['Calm', 'Slightly tense', 'Stressed', 'Overloaded'] },
  { id: 'sleep', label: 'Sleep', options: ['Rested', 'Light sleep', 'Poor sleep', 'Not sure'] },
  { id: 'body', label: 'Body signal', options: ['Fine', 'Head heavy', 'Tight shoulders', 'Low appetite', 'Other'], allowText: true },
  { id: 'focus', label: 'Focus today', options: ['Keep it steady', 'Be productive', 'Recover', 'Be mindful', 'Be social'] },
];

function renderCheckinStep(card, state) {
  const step = CHECKIN_STEPS[state.step] || CHECKIN_STEPS[0];
  const current = state.answers[step.id] || '';
  const prompt = document.createElement('div');
  prompt.className = 'card-body-text';
  prompt.textContent = step.label;
  card.appendChild(prompt);

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'chip-row';

  step.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = opt;
    if (opt === current) btn.classList.add('is-selected');
    btn.addEventListener('click', () => {
      handleCheckinSelect(step.id, opt, state);
      optionsWrap.querySelectorAll('.chip').forEach(ch => ch.classList.toggle('is-selected', ch.textContent === opt));
      toggleOtherInput(opt);
      updateNavState();
    });
    optionsWrap.appendChild(btn);
  });

  card.appendChild(optionsWrap);

  let otherInput = null;
  if (step.allowText) {
    otherInput = document.createElement('input');
    otherInput.type = 'text';
    otherInput.className = 'chip-input';
    otherInput.placeholder = 'Add a note (optional)';
    if (current && !step.options.includes(current)) {
      otherInput.value = current;
    }
    otherInput.addEventListener('change', (e) => {
      const val = e.target.value?.trim();
      handleCheckinSelect(step.id, val || '', state);
      updateNavState();
    });
    card.appendChild(otherInput);
  }

  const nav = document.createElement('div');
  nav.className = 'checkin-nav';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn ghost subtle';
  back.textContent = 'Back';
  back.disabled = state.step === 0;
  back.addEventListener('click', () => goBackCheckin(state));

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn';
  next.textContent = state.step === CHECKIN_STEPS.length - 1 ? 'Finish' : 'Next';
  next.disabled = !Boolean(current);
  next.addEventListener('click', () => advanceCheckinStep(state));

  nav.appendChild(back);
  nav.appendChild(next);
  card.appendChild(nav);

  function toggleOtherInput(sel) {
    if (!otherInput) return;
    const isOther = sel === 'Other';
    otherInput.style.display = isOther ? 'block' : 'none';
    if (!isOther) otherInput.value = '';
  }

  function updateNavState() {
    const latest = getCheckinState();
    const answer = latest.answers[step.id] || '';
    next.disabled = !Boolean(answer);
  }

  toggleOtherInput(current === 'Other' ? 'Other' : current);
  updateNavState();
}

function handleCheckinSelect(stepId, value, state) {
  const next = { ...state, answers: { ...state.answers, [stepId]: value }, status: 'in_progress' };
  saveCheckinState(next);
}

function advanceCheckinStep(state) {
  const latest = getCheckinState();
  const nextStep = latest.step + 1;
  const next = { ...latest };
  if (nextStep >= CHECKIN_STEPS.length) {
    next.status = 'done';
    next.step = CHECKIN_STEPS.length;
  } else {
    next.status = 'in_progress';
    next.step = nextStep;
  }
  saveCheckinState(next);
  refreshFeedStarter();
}

function goBackCheckin(state) {
  const prevStep = Math.max(0, state.step - 1);
  const next = { ...state, step: prevStep, status: 'in_progress' };
  saveCheckinState(next);
  refreshFeedStarter();
}

function summarizeCheckin(answers = {}) {
  const energy = (answers.energy || 'steady').toLowerCase();
  const stress = (answers.stress || 'calm').toLowerCase();
  return `You look ${stress} with ${energy} energy.`;
}

// ---------- Weather helpers ----------

function extractMetric(raw, keyword) {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (keyword === 'wind' && lower.includes('wind')) return raw.match(/wind[^,;]*/i)?.[0] || '';
  if (keyword === 'humidity' && lower.includes('humidity')) return raw.match(/humidity[^,;]*/i)?.[0] || '';
  if (keyword === 'chance' && (lower.includes('chance') || lower.includes('%'))) {
    const hit = raw.match(/(chance|probability)[^,;]*/i);
    return hit ? hit[0] : '';
  }
  return '';
}

function initFeedStarter() {
  // Hard block in unified
  if (typeof window !== 'undefined' && window.__feedStarterBlocked) {
    return;
  }
  
  if (initFeedStarter.__initialized) return;
  initFeedStarter.__initialized = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshFeedStarter);
  } else {
    refreshFeedStarter();
  }

  window.addEventListener('quick-setup-saved', refreshFeedStarter);
  window.addEventListener('quick-setup-finished', refreshFeedStarter);
}

// IMPORTANT: never auto-start in unified mode
if (typeof window === 'undefined' || !window.__feedStarterBlocked) {
  initFeedStarter();
}

// Export functions for unified mode (overlay functions can be shared)
if (typeof window !== 'undefined' && !window.__feedStarterBlocked) {
  // Legacy modes only: expose helpers for other modules.
  window.markInboxItem = markInboxItem;
  window.startCheckinOverlay = startCheckinOverlay;
  window.syncUnreadBadges = syncUnreadBadges;
  window.refreshFeedStarter = refreshFeedStarter;
  window.openCheckinOverlay = openOverlay;
  window.renderCheckinOverlay = renderOverlay;
}

