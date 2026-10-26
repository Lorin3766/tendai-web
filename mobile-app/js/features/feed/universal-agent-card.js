// Serron — Universal Agent Card (4-layer hardware-grade shell; all feed agents)
// @owner: feed
// @role: ui

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
      deltaLine = `Baseline ${avgNum} · Δ ${sign}${Number.isInteger(d) ? d : d.toFixed(1)}`;
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
  // with placeholder / mock / "awaiting sync" copy.
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
export function deriveStatusPillLabel(tone, verdictText = '') {
  if (tone === 'searching') return 'Awaiting';
  if (tone === 'alert') return 'Alert';
  const t = String(verdictText || '').toUpperCase();
  if (t.includes('AWAITING') || t.includes('SEARCHING')) return 'Awaiting';
  if (t.includes('INTERVENTION') || t.includes('RECOVERY REQUIRED')) return 'Alert';
  if (t.includes('PERSONAL INSIGHT')) return 'Insight';
  if (t.includes('GROUNDED SCIENCE')) return 'Science';
  if (t.includes('OPTIMAL')) return 'Optimal';
  return tone === 'optimal' ? 'Optimal' : 'Signal';
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
  const agentCode = String(props.agentCode || 'AGT-00').trim() || 'AGT-00';
  const agentTitle = String(props.agentTitle || 'SYSTEM CHANNEL').trim() || 'SYSTEM CHANNEL';
  const statusPillLabel = deriveStatusPillLabel(verdictTone, verdictText);
  const iconInner = props.identityIconSvg || '';
  const maturityStage = Math.max(
    0,
    Math.min(3, Math.round(Number(props.maturityStage ?? 0) || 0))
  );
  const maturityTitles = {
    0: 'Stage 0 — Baseline: profile + general science (no personal data yet)',
    1: 'Stage 1 — Passive data started (sensors / Talk)',
    2: 'Stage 2 — Trends and cross-domain connections',
    3: 'Stage 3 — Biomarkers / lab-grounded recommendations',
  };
  const maturityLabels = {
    0: 'Baseline',
    1: 'Calibrated',
    2: 'Trends',
    3: 'Biomarkers',
  };

  const slot = props.contentSlot && typeof props.contentSlot === 'object' ? props.contentSlot : null;
  const slotKind =
    slot?.kind === 'personal_insight' || slot?.kind === 'grounded_science'
      ? slot.kind
      : 'grounded_science';
  const slotTitle =
    String(slot?.title || (slotKind === 'personal_insight' ? 'Personal Insight' : 'Grounded Science')).trim();
  const slotBody = String(slot?.body || '').trim();
  const noFact = slot?.noFact === true || !slotBody;
  const slotSource = noFact ? '' : String(slot?.sourceLabel || '').trim();
  const nudge = props.confidenceNudge && typeof props.confidenceNudge === 'object' ? props.confidenceNudge : null;
  const showConfidenceNudge = maturityStage >= 1 && Boolean(nudge?.show && String(nudge?.text || '').trim());
  const confidenceNudgeText = showConfidenceNudge ? String(nudge.text).trim() : '';
  const calibrationText = String(props.calibrationText || '').trim();
  const calibrationSettings = props.calibrationAction === 'settings';
  const showSensorPill = props.signalActive || maturityStage >= 1;

  const classes = ['agent-report-card', 'agent-report-card--panel', `agent-report-card--track-${trackId}`, 'heart-agent-module-card', 'universal-agent-card'];
  for (const c of props.extraCardClasses || []) {
    if (c) classes.push(String(c));
  }
  if (props.agentPaused) classes.push('agent-report-card--paused');
  if (verdictTone === 'alert') classes.push('heart-agent-module-card--alert');
  if (verdictTone === 'optimal') classes.push('heart-agent-module-card--optimal');

  const el = document.createElement('article');
  el.className = classes.join(' ');
  el.dataset.agentName = agentName;
  el.dataset.trackId = trackId;
  el.dataset.maturityStage = String(maturityStage);
  el.dataset.focusAreaId = String(props.focusAreaId || '');
  el.dataset.storedStage = String(props.storedStage ?? 0);
  el.dataset.signalActive = props.signalActive ? '1' : '0';
  el.dataset.contentKind = slotKind;

  const sd = props.sensorData && typeof props.sensorData === 'object' && !Array.isArray(props.sensorData) ? props.sensorData : {};
  const signalConfidencePct = Number(
    props.signalConfidencePct ?? props.integrityPct
  ) || 0;
  const showSignalConfidence = maturityStage >= 1 && signalConfidencePct > 0;
  el.dataset.signalConfidence = String(signalConfidencePct);
  const payoffEchoText = String(props.payoffEchoText || '').trim();
  const payoffContext = String(props.payoffContext || '').trim();
  const dashboard = renderReadOnlyDashboardHtml(trackId, sd, signalConfidencePct);
  // Hide expand/PRIMARY METRIC when there's no real reading — that panel was
  // surfacing mock/awaiting copy under the Insight/Science slot.
  const showDetails = dashboard.hasRealMetric;
  const dashboardHtml = showDetails ? dashboard.html : '';

  el.innerHTML = `
    <div class="agent-report-card-inner heart-agent-module">
      <section class="heart-agent-module__layer heart-agent-module__layer--user">
        <header class="heart-agent-module__head">
          <div class="heart-agent-module__identity">
            <div class="heart-agent-module__avatar" data-uac-header-avatar aria-hidden="true">
              <span class="heart-agent-module__avatar-icon">${iconInner}</span>
            </div>
            <div class="heart-agent-module__identity-copy">
              <span class="heart-agent-module__agent-code">${universalEsc(agentCode)}</span>
              <h3 class="heart-agent-module__agent-title">${universalEsc(agentTitle)}</h3>
            </div>
          </div>
          <div class="agent-card-menu-anchor heart-agent-module__system-menu-anchor">
            <button type="button" class="agent-card-menu-trigger heart-agent-module__system-menu-trigger" aria-expanded="false" aria-label="Agent system menu">
              <span class="heart-agent-module__system-menu-dots" aria-hidden="true">...</span>
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
        </header>
        <div class="heart-agent-module__signal-row">
          <span
            class="heart-agent-module__signal-pill heart-agent-module__signal-pill--${universalEsc(verdictTone)}"
            data-uac-status-pill
            role="status"
            aria-live="polite"
            aria-label="Agent status: ${universalEsc(statusPillLabel)}"
          >
            <span class="heart-agent-module__signal-pill-text" data-uac-status-pill-text>${universalEsc(statusPillLabel)}</span>
          </span>
        </div>
        <div class="heart-agent-module__status-row">
          ${showSensorPill ? `<span class="heart-agent-module__status-pill">${universalEsc(props.signalActive ? 'Sensor linked' : 'Sensor offline')}</span>` : ''}
          <span
            class="heart-agent-module__maturity"
            data-uac-maturity
            data-maturity-stage="${maturityStage}"
            title="${universalEsc(maturityTitles[maturityStage])}"
          >Stage ${maturityStage} · ${universalEsc(maturityLabels[maturityStage])}</span>
          ${showSignalConfidence ? `<span class="heart-agent-module__signal-confidence heart-agent-module__integrity" title="Data quality: recency, consistency, and cross-source agreement">Signal Confidence: ${universalEsc(`${Math.round(signalConfidencePct)}%`)}</span>` : ''}
          <time class="heart-agent-module__time" ${props.timeIso ? `datetime="${universalEsc(props.timeIso)}"` : ''}>${universalEsc(props.timeStr || '—')}</time>
        </div>
        ${
          noFact
            ? ''
            : `<div
          class="heart-agent-module__content-slot heart-agent-module__content-slot--${universalEsc(slotKind)}"
          data-uac-content-slot
          data-content-kind="${universalEsc(slotKind)}"
        >
          <div class="heart-agent-module__content-slot-eyebrow">${universalEsc(slotTitle)}</div>
          <p class="heart-agent-module__content-slot-body">${universalEsc(slotBody)}</p>
          ${
            slotSource
              ? `<div class="heart-agent-module__content-slot-source">${universalEsc(slotSource)}</div>`
              : ''
          }
        </div>`
        }
        ${
          payoffEchoText
            ? `<p class="heart-agent-module__payoff" data-uac-payoff>${universalEsc(payoffEchoText)}</p>
               ${payoffContext ? `<p class="heart-agent-module__payoff-context" data-uac-payoff-context>${universalEsc(payoffContext)}</p>` : ''}`
            : ''
        }
        ${
          calibrationText
            ? `<p class="heart-agent-module__calibration" data-uac-calibration>${universalEsc(calibrationText)}</p>
               ${
                 calibrationSettings
                   ? `<button type="button" class="heart-agent-module__btn heart-agent-module__btn--primary" data-uac-action="settings-city" data-uac-calibration-settings>Add city in Settings</button>`
                   : `<button type="button" class="heart-agent-module__btn heart-agent-module__btn--primary" data-uac-action="confidence-talk" data-uac-calibration-talk>Open Talk</button>`
               }`
            : ''
        }
        ${
          showConfidenceNudge
            ? `<div class="heart-agent-module__confidence-nudge" data-uac-confidence-nudge role="note">
                <p class="heart-agent-module__confidence-nudge-text">${universalEsc(confidenceNudgeText)}</p>
                <button type="button" class="heart-agent-module__btn heart-agent-module__btn--primary" data-uac-action="confidence-talk">Open Talk</button>
              </div>`
            : ''
        }
        <div class="heart-agent-module__actions heart-agent-module__actions--collapsed">
          <button type="button" class="heart-agent-module__btn heart-agent-module__btn--switch" data-uac-action="discuss">Discuss</button>
          <button type="button" class="heart-agent-module__btn heart-agent-module__btn--switch" data-uac-action="remind">Remind</button>
        </div>
        ${
          showDetails
            ? `<button
          type="button"
          class="heart-agent-module__chevron-toggle"
          aria-expanded="false"
          aria-label="Toggle focus area details"
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M6 9.5l6 6 6-6" />
          </svg>
        </button>`
            : ''
        }
      </section>

      ${
        showDetails
          ? `<div class="heart-agent-module__details" hidden>
        <div class="heart-agent-module__analytics-shell heart-agent-module__analytics-shell--hub" role="region" aria-label="Focus Area signal analytics">
          ${dashboardHtml}
        </div>
      </div>`
          : ''
      }
    </div>
  `;

  // Guard: a card must never host more than one Insight/Science slot.
  const slots = el.querySelectorAll('[data-uac-content-slot]');
  for (let i = 1; i < slots.length; i += 1) slots[i].remove();

  const details = el.querySelector('.heart-agent-module__details');
  const toggle = el.querySelector('.heart-agent-module__chevron-toggle');
  let isExpanded = false;
  const syncExpandedUi = () => {
    if (details) {
      details.hidden = !isExpanded;
    }
    if (toggle) {
      toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    }
    el.classList.toggle('heart-agent-module-card--expanded', isExpanded);
    el.dataset.agentExpanded = isExpanded ? 'true' : 'false';
  };
  syncExpandedUi();

  if (toggle) {
    el.addEventListener('click', (e) => {
      const btn = e.target && typeof e.target.closest === 'function' ? e.target.closest('.heart-agent-module__chevron-toggle') : null;
      if (!btn || !el.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      isExpanded = !isExpanded;
      syncExpandedUi();
    });
  }

  return el;
}
