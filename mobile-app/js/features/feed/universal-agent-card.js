// Serron — Universal Agent Card (4-layer hardware-grade shell; all feed agents)
// @owner: feed
// @role: ui

import { focusAreaGlyphHtml, getFocusAreaVisual } from '../human-os/focus-area-visuals.js';

export const UNIVERSAL_AGENT_SEARCHING = '[ SEARCHING FOR SIGNAL... ]';

/**
 * @param {unknown} v
 */
export function universalEsc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {number} signalConfidencePct
 */
function buildSignalConfidenceState(signalConfidencePct) {
  const pct = Math.round(
    Math.max(0, Math.min(100, Number(signalConfidencePct) || 0))
  );
  const level = pct >= 80 ? 'HIGH' : pct >= 50 ? 'MEDIUM' : 'LOW';
  return { state: `${level} · ${pct}%`, tier: 'confidence' };
}

/**
 * Defaults for the expanded control hub (daily goal semantics per track).
 * @param {string} trackId
 * @param {Record<string, unknown>} sd
 */
export function buildControlHubConfig(trackId, sd) {
  const s = sd && typeof sd === 'object' && !Array.isArray(sd) ? sd : {};
  const asNum = (...vals) => {
    for (const v of vals) {
      const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').trim());
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const tr = String(trackId || 'general').toLowerCase();

  if (tr === 'sleep' || tr === 'energy') {
    const def = asNum(s.sleep_goal_h, s.target_sleep_h, 8) ?? 8;
    return {
      defaultGoal: def,
      goalStep: 0.25,
      goalMin: 4,
      goalMax: 12,
      goalSuffix: ' h',
      decimals: 2,
    };
  }
  if (tr === 'activity' || tr === 'heart' || tr === 'move') {
    const def = asNum(s.step_goal, s.daily_step_goal, 10000) ?? 10000;
    return {
      defaultGoal: def,
      goalStep: 500,
      goalMin: 1000,
      goalMax: 60000,
      goalSuffix: '',
      decimals: 0,
    };
  }
  if (tr === 'nutrition' || tr === 'labs') {
    return {
      defaultGoal: 90,
      goalStep: 5,
      goalMin: 0,
      goalMax: 100,
      goalSuffix: '%',
      decimals: 0,
    };
  }
  return {
    defaultGoal: 85,
    goalStep: 5,
    goalMin: 0,
    goalMax: 100,
    goalSuffix: '%',
    decimals: 0,
  };
}

/**
 * @param {number} v
 * @param {{ goalSuffix: string, decimals: number }} cfg
 */
function formatGoalDisplay(v, cfg) {
  if (cfg.goalSuffix.includes('h')) {
    return String(Math.round(v * 10) / 10);
  }
  if (cfg.decimals > 0) return String(Number(v.toFixed(cfg.decimals)));
  return String(Math.round(v));
}

/**
 * @param {unknown[]} vals
 */
function asSdNumFirst(...vals) {
  for (const v of vals) {
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * @param {string} trackId
 * @param {Record<string, unknown>} sd
 * @param {ReturnType<typeof buildControlHubConfig>} cfg
 * @param {number} signalConfidencePct
 */
function extractPrimaryReadout(trackId, sd, cfg, signalConfidencePct) {
  const s = sd && typeof sd === 'object' && !Array.isArray(sd) ? sd : {};
  const tr = String(trackId || 'general').toLowerCase();

  if (tr === 'sleep' || tr === 'energy') {
    const cur = asSdNumFirst(s.sleep_hours_total, s.sleep_h, s.deep_sleep_h);
    const avg = asSdNumFirst(s.sleep_7d_avg_h, s.trend_7d_avg_h, s.baseline_sleep_h, s.avg_sleep_h);
    const goal = cfg.defaultGoal;
    return {
      mode: /** @type {'metric'} */ ('metric'),
      hasData: cur != null,
      display: cur != null ? String(Math.round(Number(cur) * 10) / 10) : '—',
      unit: cur != null ? 'h' : '',
      caption:
        cur != null ? `vs goal ${formatGoalDisplay(goal, cfg)}${cfg.goalSuffix}`.trim() : '',
      currentNum: cur,
      goalNum: goal,
      avgNum: avg,
      unitKind: /** @type {'h'} */ ('h'),
    };
  }

  if (tr === 'activity' || tr === 'heart' || tr === 'move') {
    const cur = asSdNumFirst(s.steps_total, s.daily_steps);
    const avg = asSdNumFirst(s.steps_7d_avg, s.avg_daily_steps, s.baseline_steps);
    const goal = cfg.defaultGoal;
    return {
      mode: 'metric',
      hasData: cur != null,
      display: cur != null ? String(Math.round(Number(cur))) : '—',
      unit: cur != null ? 'steps' : '',
      caption: cur != null ? `vs goal ${Math.round(Number(goal)).toLocaleString()}` : '',
      currentNum: cur,
      goalNum: goal,
      avgNum: avg,
      unitKind: /** @type {'steps'} */ ('steps'),
    };
  }

  if (tr === 'nutrition' || tr === 'labs') {
    const gl = asSdNumFirst(s.glucose_mgdl);
    const kg = asSdNumFirst(s.body_weight_kg);
    const ml = asSdNumFirst(s.hydration_ml);
    const cur = gl ?? kg ?? ml;
    let display = '—';
    let unit = '';
    if (gl != null) {
      display = String(Math.round(gl));
      unit = 'mg/dL';
    } else if (kg != null) {
      display = String(kg);
      unit = 'kg';
    } else if (ml != null) {
      display = String(Math.round(ml));
      unit = 'ml';
    }
    const goal = cfg.defaultGoal;
    const avg = asSdNumFirst(s.metric_7d_avg, s.baseline_metric);
    return {
      mode: 'metric',
      hasData: cur != null,
      display,
      unit,
      caption: cur != null ? `Target band ~${Math.round(goal)}${cfg.goalSuffix}` : '',
      currentNum: cur,
      goalNum: goal,
      avgNum: avg,
      unitKind: /** @type {'generic'} */ ('generic'),
    };
  }

  const confidence = Math.round(
    Math.max(0, Math.min(100, Number(signalConfidencePct) || 0))
  );
  return {
    mode: /** @type {'signal-confidence'} */ ('signal-confidence'),
    hasData: true,
    display: String(confidence),
    unit: '%',
    caption: 'Signal confidence · data quality synthesis',
    currentNum: confidence,
    goalNum: 100,
    avgNum: null,
    unitKind: /** @type {'pct'} */ ('pct'),
  };
}

/**
 * @param {{
 *   mode: string,
 *   currentNum: number|null,
 *   goalNum: number|null,
 *   avgNum: number|null,
 *   unitKind: string,
 * }} readout
 */
function buildProgressAndDelta(readout) {
  let progressPct = null;
  if (readout.mode === 'signal-confidence' && readout.currentNum != null) {
    progressPct = Math.max(0, Math.min(100, readout.currentNum));
  } else if (
    readout.mode === 'metric' &&
    readout.currentNum != null &&
    readout.goalNum != null &&
    Number(readout.goalNum) > 0
  ) {
    progressPct = Math.max(0, Math.min(100, (Number(readout.currentNum) / Number(readout.goalNum)) * 100));
  }

  const { currentNum, avgNum, unitKind } = readout;
  /** @type {string} */
  let deltaLine = '';
  if (avgNum != null && currentNum != null) {
    const d = Number(currentNum) - Number(avgNum);
    const sign = d >= 0 ? '+' : '';
    if (unitKind === 'h') {
      deltaLine = `Avg ${Math.round(Number(avgNum) * 10) / 10} h · Δ ${sign}${Math.round(d * 10) / 10} h`;
    } else if (unitKind === 'steps') {
      deltaLine = `Avg ${Math.round(Number(avgNum)).toLocaleString()} · Δ ${sign}${Math.round(d).toLocaleString()}`;
    } else {
      deltaLine = `Avg ${avgNum} · Δ ${sign}${Number.isInteger(d) ? d : d.toFixed(1)}`;
    }
  } else if (readout.mode === 'signal-confidence') {
    deltaLine = 'Recency · consistency · cross-source agreement';
  } else if (avgNum != null) {
    deltaLine =
      unitKind === 'h'
        ? `Rolling avg ${Math.round(Number(avgNum) * 10) / 10} h`
        : `Rolling avg ${Math.round(Number(avgNum)).toLocaleString()}`;
  } else {
    deltaLine = '';
  }

  const fill = progressPct != null && Number.isFinite(progressPct) ? progressPct : 0;
  return { progressPct: fill, deltaLine };
}

/**
 * @param {string} trackId
 * @param {Record<string, unknown>} sd
 * @param {number} signalConfidencePct
 * @returns {{ html: string, hasRealMetric: boolean }}
 */
function renderReadOnlyDashboardHtml(trackId, sd, signalConfidencePct) {
  const safeId = `uac-dash-${String(trackId).replace(/[^a-z0-9_-]/gi, '')}`;
  const cfg = buildControlHubConfig(trackId, sd);
  const readout = extractPrimaryReadout(trackId, sd, cfg, signalConfidencePct);
  const { deltaLine } = buildProgressAndDelta(readout);
  const trend = buildSignalConfidenceState(signalConfidencePct);
  const tier = trend.tier || 'stable';
  const fillRounded = Math.round(
    Math.max(0, Math.min(100, Number(signalConfidencePct) || 0))
  );
  const unitHtml = readout.unit
    ? `<span class="uac-dashboard__unit">${universalEsc(readout.unit)}</span>`
    : '';

  // PRIMARY METRIC is only shown when a real numeric stream exists — never
  // with placeholder / mock / empty-sync copy.
  const hasRealMetric = Boolean(readout.hasData && readout.mode === 'metric');
  const caption = sanitizeUserFacingMetricCopy(readout.caption);
  const delta = sanitizeUserFacingMetricCopy(deltaLine);

  const focalHtml = hasRealMetric
    ? `
      <div class="uac-dashboard__focal-wrap">
        <p id="${safeId}-title" class="uac-dashboard__eyebrow">Primary reading</p>
        <div class="uac-dashboard__focal" aria-live="polite">
          <span class="uac-dashboard__value">${universalEsc(readout.display)}</span>${unitHtml}
        </div>
        ${caption ? `<p class="uac-dashboard__caption">${universalEsc(caption)}</p>` : ''}
      </div>`
    : '';

  return {
    hasRealMetric,
    html: `
    <div class="uac-dashboard" role="region" aria-label="Focus Area signal details">
      ${focalHtml}
      <div class="uac-dashboard__panel uac-details__panel uac-dashboard__panel--trend" data-uac-details-panel>
        <div class="uac-dashboard__trend-header">
          <span class="uac-dashboard__trend-label">SIGNAL CONFIDENCE</span>
          <span class="uac-trend-state uac-trend-state--${tier}" role="status">${universalEsc(trend.state)}</span>
        </div>
        <div
          class="uac-progress-track"
          data-track-goal-bar
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${fillRounded}"
          aria-valuetext="Signal confidence ${fillRounded} percent"
        >
          <div class="uac-progress-track__fill" data-track-goal-bar-fill style="width:${fillRounded}%"></div>
        </div>
        ${delta ? `<p class="uac-dashboard__delta">${universalEsc(delta)}</p>` : ''}
      </div>
    </div>
  `,
  };
}

/**
 * Strip internal/mock/dev copy so it never reaches the Feed card UI.
 * @param {unknown} text
 * @returns {string}
 */
function sanitizeUserFacingMetricCopy(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  if (
    /local mock|mock parsing|awaiting passive|device sync|sys log|placeholder|TODO\(/i.test(
      s
    )
  ) {
    return '';
  }
  return s;
}

/**
 * @param {unknown} v
 * @param {string} [suffix]
 */
/**
 * @param {'optimal'|'alert'|'searching'} tone
 * @param {string} [verdictText]
 */
/**
 * Internal status label for non-user chrome. Never returns a judgmental status phrase.
 * Kept for callers that still patch pill text; Task 13 collapsed cards hide the pill.
 */
export function deriveStatusPillLabel(tone, verdictText = '') {
  if (tone === 'searching') return 'Learning';
  if (tone === 'alert') return 'Alert';
  const t = String(verdictText || '').toUpperCase();
  if (t.includes('SEARCHING') || t.includes('BASELINE') || t.includes('MANUAL')) return 'Learning';
  if (t.includes('INTERVENTION') || t.includes('RECOVERY REQUIRED')) return 'Alert';
  if (t.includes('PERSONAL INSIGHT')) return 'Insight';
  if (t.includes('GROUNDED SCIENCE')) return 'Science';
  return 'Update';
}

export function universalFmtMetric(v, suffix = '') {
  if (v == null || v === '') return UNIVERSAL_AGENT_SEARCHING;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v).trim());
  if (!Number.isFinite(n)) return UNIVERSAL_AGENT_SEARCHING;
  return `${Math.round(n)}${suffix}`;
}

/**
 * @typedef {{
 *   variant: 'hrv'|'resting_spark'|'progress'|'percent_only'|'text_only',
 *   label: string,
 *   line1?: string|null,
 *   line2?: string|null,
 *   progressPct?: number|null,
 *   hrvPointerPct?: number|null,
 *   sparklineD?: string|null,
 * }} UniversalMetricWidget
 */

/**
 * @typedef {{
 *   trackId: string,
 *   agentName: string,
 *   agentCode: string,
 *   agentTitle: string,
 *   identityIconSvg: string,
 *   verdictText: string,
 *   verdictTone: 'optimal'|'alert'|'searching',
 *   signalActive: boolean,
 *   signalConfidencePct: number,
 *   integrityPct?: number,
 *   maturityStage?: number,
 *   timeStr: string,
 *   timeIso: string,
 *   agentPaused: boolean,
 *   insightText: string,
 *   contentSlot?: { kind?: string, title?: string, body?: string, sourceLabel?: string },
 *   confidenceNudge?: { show?: boolean, text?: string },
 *   systemLogText: string,
 *   analyticsWidgets?: UniversalMetricWidget[],
 *   sensorData?: Record<string, unknown>,
 *   expandedSecondary: { kind: 'adjust'|'confirm', label: string },
 *   extraCardClasses?: string[],
 * }} UniversalAgentCardProps
 */

/**
 * @param {UniversalAgentCardProps} props
 * @returns {HTMLElement}
 */
export function createUniversalAgentCard(props) {
  const agentName = String(props.agentName || '').trim() || 'Agent';
  const trackId = String(props.trackId || 'general');
  const verdictTone = props.verdictTone === 'alert' || props.verdictTone === 'searching' ? props.verdictTone : 'optimal';
  const verdictText = props.verdictText != null ? String(props.verdictText) : UNIVERSAL_AGENT_SEARCHING;
  const agentTitle = String(props.agentTitle || agentName).trim() || agentName;
  const iconInner = props.identityIconSvg || '';
  const maturityStage = Math.max(
    0,
    Math.min(3, Math.round(Number(props.maturityStage ?? 0) || 0))
  );

  const slot = props.contentSlot && typeof props.contentSlot === 'object' ? props.contentSlot : null;
  const slotKind =
    slot?.kind === 'personal_insight' || slot?.kind === 'grounded_science'
      ? slot.kind
      : 'grounded_science';
  const slotBody = String(slot?.body || '').trim();
  const noFact = slot?.noFact === true || !slotBody;
  const calibrationText = String(props.calibrationText || '').trim();
  const calibrationSettings = props.calibrationAction === 'settings';
  const knowledgeLine = String(props.knowledgeLine || '').trim();
  const valueHeadline = String(props.valueHeadline || '').trim();
  const metaLine = String(props.metaLine || '').trim();
  const payoffEchoText = String(props.payoffEchoText || '').trim();
  const payoffContext = String(props.payoffContext || '').trim();
  const nextQ = props.nextQuestion && typeof props.nextQuestion === 'object' ? props.nextQuestion : null;
  const focusAreaId = String(props.focusAreaId || '');
  const visual = focusAreaId ? getFocusAreaVisual(focusAreaId) : null;
  const glyphHtml = focusAreaId
    ? focusAreaGlyphHtml(focusAreaId, 'uac-compact__glyph')
    : iconInner
      ? `<span class="uac-compact__icon" aria-hidden="true">${iconInner}</span>`
      : '';

  const classes = [
    'agent-report-card',
    'agent-report-card--panel',
    `agent-report-card--track-${trackId}`,
    'heart-agent-module-card',
    'universal-agent-card',
    'uac-compact',
    'uac-alive',
  ];
  for (const c of props.extraCardClasses || []) {
    if (c) classes.push(String(c));
  }
  if (props.agentPaused) classes.push('agent-report-card--paused');
  if (valueHeadline) classes.push('uac-alive--filled');
  else classes.push('uac-alive--empty');

  const el = document.createElement('article');
  el.className = classes.join(' ');
  el.dataset.agentName = agentName;
  el.dataset.trackId = trackId;
  el.dataset.maturityStage = String(maturityStage);
  el.dataset.focusAreaId = focusAreaId;
  el.dataset.storedStage = String(props.storedStage ?? 0);
  el.dataset.signalActive = props.signalActive ? '1' : '0';
  el.dataset.contentKind = slotKind;
  el.dataset.signalConfidence = String(Number(props.signalConfidencePct ?? props.integrityPct) || 0);
  if (visual) el.style.setProperty('--area-color', visual.hex);

  const talkAction = calibrationSettings ? 'settings-city' : 'confidence-talk';
  const talkLabel = calibrationSettings ? 'Settings' : 'Talk';

  const chipsHtml = (nextQ?.chips || [])
    .map(
      (chip, i) =>
        `<button type="button" class="uac-chip" data-uac-chip data-chip-index="${i}">${universalEsc(chip.label)}</button>`,
    )
    .join('');
  const questionBlock = nextQ
    ? `<div class="uac-compact__ask" data-uac-ask-block>
        <p class="uac-compact__ask-text" data-uac-ask>${universalEsc(nextQ.ask)}</p>
        ${
          nextQ.settingsCity
            ? `<button type="button" class="uac-chip uac-chip--talk" data-uac-action="settings-city" data-uac-calibration-settings>Open Settings</button>`
            : nextQ.talkOnly
              ? `<button type="button" class="uac-chip uac-chip--talk" data-uac-action="confidence-talk" data-uac-calibration-talk>Answer in Talk</button>`
              : `<div class="uac-compact__chips" data-uac-chips>${chipsHtml}</div>`
        }
        ${
          nextQ.settingsCity
            ? ''
            : `<button type="button" class="uac-compact__rather" data-uac-rather>Rather not say</button>`
        }
      </div>`
    : '';

  const valueBlock = valueHeadline
    ? `<span class="uac-compact__value" data-uac-value>${universalEsc(valueHeadline)}</span>
       <span class="uac-compact__meta" data-uac-meta>${universalEsc(metaLine)}</span>`
    : `<span class="uac-compact__value uac-compact__value--empty" data-uac-value hidden></span>
       <span class="uac-compact__meta" data-uac-meta hidden></span>`;

  el.innerHTML = `
    <div class="agent-report-card-inner heart-agent-module uac-compact__inner">
      <div class="uac-compact__row uac-compact__row--head">
        <button
          type="button"
          class="uac-compact__toggle"
          aria-expanded="false"
          aria-controls="uac-expand-${universalEsc(focusAreaId || trackId)}"
          data-uac-expand-toggle
        >
          <span class="uac-compact__identity">
            ${glyphHtml}
            <span class="uac-compact__title" data-uac-maturity>${universalEsc(agentTitle)}</span>
          </span>
          ${valueBlock}
          <span class="sr-only" data-uac-payoff>${universalEsc(payoffEchoText)}</span>
          <span class="sr-only" data-uac-calibration>${universalEsc(calibrationText || knowledgeLine)}</span>
        </button>
        <button
          type="button"
          class="uac-compact__talk"
          data-uac-action="${talkAction}"
          ${calibrationSettings ? 'data-uac-calibration-settings' : 'data-uac-calibration-talk'}
        >${universalEsc(talkLabel)}</button>
      </div>
      ${questionBlock}
      <div class="uac-compact__payoff-inline" data-uac-payoff-inline hidden></div>
      <div
        class="uac-compact__expand heart-agent-module__details"
        id="uac-expand-${universalEsc(focusAreaId || trackId)}"
        hidden
        data-uac-expand-panel
      >
        ${
          !noFact && payoffContext
            ? `<p class="uac-compact__library" data-uac-payoff-context data-uac-content-slot>${universalEsc(payoffContext)}</p>`
            : !noFact && slotBody
              ? `<p class="uac-compact__library" data-uac-content-slot>${universalEsc(slotBody)}</p>`
              : ''
        }
        <div class="uac-compact__actions heart-agent-module__actions">
          <button type="button" class="heart-agent-module__btn heart-agent-module__btn--switch" data-uac-action="discuss">Discuss</button>
          <button type="button" class="heart-agent-module__btn heart-agent-module__btn--switch" data-uac-action="remind">Remind</button>
          <div class="agent-card-menu-anchor uac-compact__menu-anchor">
            <button type="button" class="agent-card-menu-trigger" aria-expanded="false" aria-label="Focus area menu">
              <span aria-hidden="true">...</span>
            </button>
            <div class="agent-card-menu" role="menu" hidden>
              <button type="button" class="agent-card-menu__item" data-agent-menu="status" role="menuitem">
                <span class="agent-card-menu__text agent-card-menu__text--status">Pause focus area</span>
              </button>
              <button type="button" class="agent-card-menu__item agent-card-menu__item--danger" data-agent-menu="delete" role="menuitem">
                <span class="agent-card-menu__text">Delete focus area</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (nextQ) {
    el._uacNextQuestion = nextQ;
  }

  const details = el.querySelector('[data-uac-expand-panel]');
  const toggle = el.querySelector('[data-uac-expand-toggle]');
  let isExpanded = false;

  const collapseOthers = () => {
    const root = el.closest('#agentReportsGrid, #agentReportsList, .agent-reports-grid') || document;
    root.querySelectorAll('.universal-agent-card.heart-agent-module-card--expanded').forEach((other) => {
      if (other === el) return;
      other.classList.remove('heart-agent-module-card--expanded');
      other.dataset.agentExpanded = 'false';
      const t = other.querySelector('[data-uac-expand-toggle]');
      const p = other.querySelector('[data-uac-expand-panel]');
      if (t) t.setAttribute('aria-expanded', 'false');
      if (p) p.hidden = true;
    });
  };

  const syncExpandedUi = () => {
    if (details) details.hidden = !isExpanded;
    if (toggle) toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    el.classList.toggle('heart-agent-module-card--expanded', isExpanded);
    el.dataset.agentExpanded = isExpanded ? 'true' : 'false';
  };
  syncExpandedUi();

  if (toggle) {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isExpanded) collapseOthers();
      isExpanded = !isExpanded;
      syncExpandedUi();
    });
  }

  return el;
}
