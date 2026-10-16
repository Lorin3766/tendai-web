// Serron — Feed content slot (single-slot fallback per Focus Area)
// @owner: feed
// @role: state
//
// One card slot → exactly one of: Personal Insight | Grounded Science.
// Myth-busting / Decision Support are intentionally out of scope.
//
// PLUG-IN POINT: replace detectPersonalInsight() with the real detection engine
// when connections / discrepancies / trends are available from user data.

import { profileState } from '../../state.js';
import { clampMaturityStage } from '../human-os/user-agents.js';
import {
  getFocusAreaById,
  getFocusAreaByName,
  resolveFocusAreaTrackId,
} from '../human-os/focus-areas.js';
import { getEntries } from './content-library.js';

/** @typedef {'personal_insight' | 'grounded_science'} FeedContentKind */

/**
 * @typedef {{
 *   kind: FeedContentKind,
 *   title: string,
 *   body: string,
 *   sourceLabel: string,
 *   focusAreaId: string|null,
 *   maturityStage: 0|1|2|3,
 * }} FeedContentSlot
 */

/**
 * Evidence-based, consensus-oriented science copy keyed by Focus Area id.
 * Filtered further by profile age band + Talk interests at resolve time.
 * @type {Record<string, Array<{ id: string, ageMin?: number, ageMax?: number, keywords?: string[], body: string, sourceLabel: string }>>}
 */
const GROUNDED_SCIENCE_BANK = {
  sleep: [
    {
      id: 'sleep-consistency',
      body: 'Consistent sleep–wake timing supports circadian alignment. Adults who keep bedtime/wake within about an hour day-to-day tend to report better daytime alertness than those with irregular schedules — even when total hours look similar.',
      sourceLabel: 'Circadian consensus · sleep regularity',
      keywords: ['sleep', 'insomnia', 'tired', 'rest'],
    },
    {
      id: 'sleep-duration-midlife',
      ageMin: 40,
      ageMax: 65,
      body: 'For midlife adults, roughly 7–9 hours of sleep is the range most consistently linked with cardiometabolic and cognitive health in observational and consensus guidance. Short sleep is more often associated with higher cardiometabolic risk than modest oversleep in this band.',
      sourceLabel: 'Sleep duration consensus · midlife',
      keywords: ['sleep', 'heart', 'energy'],
    },
    {
      id: 'sleep-younger',
      ageMax: 39,
      body: 'Among younger adults, protecting a dark, cool sleep environment and limiting late caffeine are among the highest-leverage habits supported by sleep-hygiene consensus — before escalating to specialized interventions.',
      sourceLabel: 'Sleep hygiene consensus',
      keywords: ['caffeine', 'sleep', 'night'],
    },
  ],
  move: [
    {
      id: 'move-weekly-volume',
      body: 'Public-health consensus still centers on ~150 minutes/week of moderate aerobic activity (or 75 vigorous), plus muscle-strengthening on 2+ days. Breaking sitting time with brief movement also tracks with better metabolic markers independent of structured workouts.',
      sourceLabel: 'Physical activity guidelines · consensus',
      keywords: ['steps', 'workout', 'exercise', 'training'],
    },
    {
      id: 'move-load-balance',
      body: 'Training load rises in injury risk when weekly volume jumps sharply. Gradual progression (avoiding large week-to-week spikes) is a core principle in load-management research across endurance and strength sports.',
      sourceLabel: 'Training load management · consensus',
      keywords: ['injury', 'soreness', 'load', 'training'],
    },
  ],
  nutrition: [
    {
      id: 'nutrition-protein-spread',
      body: 'Distributing protein across meals (rather than one large evening bolus) is consistently associated with better muscle-protein synthesis signaling in adults — especially useful when training or maintaining lean mass is a goal.',
      sourceLabel: 'Protein distribution · nutrition consensus',
      keywords: ['protein', 'diet', 'meal', 'muscle'],
    },
    {
      id: 'nutrition-fiber',
      body: 'Higher dietary fiber intake is one of the most robust diet–health associations in nutrition epidemiology — linked to better glycemic control and lower cardiometabolic risk when patterns are sustained.',
      sourceLabel: 'Dietary fiber · epidemiologic consensus',
      keywords: ['fiber', 'gut', 'glucose', 'diet'],
    },
  ],
  labs: [
    {
      id: 'labs-trend-over-snapshot',
      body: 'For most biomarkers, trend and context (fasting state, meds, illness) matter more than a single out-of-range value. Re-testing before acting on an isolated result is standard clinical caution outside acute emergencies.',
      sourceLabel: 'Lab interpretation · clinical consensus',
      keywords: ['blood', 'lab', 'panel', 'biomarker'],
    },
  ],
  stress: [
    {
      id: 'stress-hrv-context',
      body: 'HRV is a useful nervous-system signal, but day-to-day swings are normal. Consensus coaching treats multi-day trends and recovery context (sleep, alcohol, illness) as more actionable than a single low reading.',
      sourceLabel: 'Autonomic / HRV interpretation · consensus',
      keywords: ['stress', 'hrv', 'anxiety', 'burnout'],
    },
  ],
  longevity: [
    {
      id: 'longevity-basics-first',
      body: 'The strongest longevity-relevant levers in the evidence base remain sleep, movement, not smoking, blood-pressure and metabolic health, and social connection — before specialized supplements or extreme protocols.',
      sourceLabel: 'Healthspan fundamentals · consensus',
      keywords: ['longevity', 'aging', 'protocol'],
    },
  ],
  skin: [
    {
      id: 'skin-uv',
      body: 'Cumulative UV exposure is the dominant modifiable driver of photoaging and skin cancer risk in consensus dermatology. Daily broad-spectrum SPF and shade behaviors remain first-line prevention across adult age bands.',
      sourceLabel: 'Photoprotection · dermatology consensus',
      keywords: ['skin', 'sun', 'spf', 'aging'],
    },
  ],
  cardio: [
    {
      id: 'cardio-rhr',
      body: 'Resting heart rate trends (not single snapshots) are a practical cardiorespiratory signal. Sustained elevations often track with fitness loss, illness, or recovery debt; improvements commonly follow consistent aerobic training.',
      sourceLabel: 'Resting HR · cardiology / fitness consensus',
      keywords: ['heart', 'cardio', 'bpm', 'fitness'],
    },
    {
      id: 'cardio-midlife',
      ageMin: 40,
      body: 'In midlife and beyond, blood-pressure awareness and aerobic capacity are repeatedly highlighted as high-ROI cardiovascular risk modifiers in prevention guidelines.',
      sourceLabel: 'CVD prevention guidelines · midlife',
      keywords: ['blood pressure', 'heart', 'cardio'],
    },
  ],
  mental: [
    {
      id: 'mental-sleep-mood',
      body: 'Sleep disruption and mood/anxiety symptoms frequently co-travel. Stabilizing sleep timing is among the most evidence-supported first steps when cognitive or emotional load is rising — before attributing everything to a single stressor.',
      sourceLabel: 'Sleep–mood interplay · clinical consensus',
      keywords: ['mood', 'anxiety', 'depression', 'stress', 'sleep'],
    },
  ],
};

const FOCUS_AREA_FALLBACK_SCIENCE = {
  body: 'Evidence-based health guidance is most useful when it is matched to your age, goals, and what you have already asked about. As personal data accumulates for this Focus Area, Obrium will prefer insights grounded in your own signals over general science.',
  sourceLabel: 'General preventive-health consensus',
};

/**
 * @returns {{ age: number|null, goals: string[], talkSnippets: string[] }}
 */
function readUserContextFilters() {
  let age = null;
  /** @type {string[]} */
  let goals = [];
  /** @type {string[]} */
  let talkSnippets = [];
  try {
    const profile = profileState.get() || {};
    const body = profile.body || {};
    age = resolveAgeYears(body);
    const pg = profile.goals?.primaryGoals;
    if (Array.isArray(pg)) goals = pg.map((g) => String(g || '').trim().toLowerCase()).filter(Boolean);
  } catch (_) {}
  try {
    const talk = talkState.get() || {};
    const hist = Array.isArray(talk.history) ? talk.history : [];
    talkSnippets = hist
      .slice(-12)
      .map((m) => String(m?.text || m?.content || m?.message || '').toLowerCase())
      .filter(Boolean);
  } catch (_) {}
  return { age, goals, talkSnippets };
}

/**
 * @param {string|null|undefined} focusAreaId
 * @param {string} trackId
 * @param {string} displayName
 */
function resolveFocusAreaKey(focusAreaId, trackId, displayName) {
  const byId = getFocusAreaById(focusAreaId);
  if (byId) return byId.id;
  const byName = getFocusAreaByName(displayName);
  if (byName) return byName.id;
  const fromTrack = resolveFocusAreaTrackId(trackId) ? trackId : null;
  // trackId may already be a focus id (sleep/move/…) or a feed track alias.
  const aliases = {
    heart: 'cardio',
    brain: 'mental',
    activity: 'move',
    energy: 'longevity',
    eyes: 'skin',
  };
  const t = String(trackId || '').toLowerCase();
  if (GROUNDED_SCIENCE_BANK[t]) return t;
  if (aliases[t] && GROUNDED_SCIENCE_BANK[aliases[t]]) return aliases[t];
  return byId?.id || fromTrack || t || 'sleep';
}

/**
 * Score a science candidate against profile age + Talk/goals keywords.
 * @param {{ ageMin?: number, ageMax?: number, keywords?: string[] }} item
 * @param {{ age: number|null, goals: string[], talkSnippets: string[] }} ctx
 */
function scoreScienceCandidate(item, ctx) {
  let score = 1;
  if (ctx.age != null) {
    if (item.ageMin != null && ctx.age < item.ageMin) score -= 2;
    if (item.ageMax != null && ctx.age > item.ageMax) score -= 2;
    if (
      (item.ageMin == null || ctx.age >= item.ageMin) &&
      (item.ageMax == null || ctx.age <= item.ageMax)
    ) {
      score += 2;
    }
  }
  const hay = `${ctx.goals.join(' ')} ${ctx.talkSnippets.join(' ')}`;
  for (const kw of item.keywords || []) {
    if (hay.includes(String(kw).toLowerCase())) score += 3;
  }
  return score;
}

/**
 * Build Grounded Science for a Focus Area (always available fallback).
 * @param {{
 *   focusAreaId?: string|null,
 *   trackId?: string,
 *   displayName?: string,
 *   maturityStage?: number,
 * }} opts
 * @returns {FeedContentSlot}
 */
export function buildGroundedScience(opts = {}) {
  const maturityStage = clampMaturityStage(opts.maturityStage ?? 0);
  const focusKey = resolveFocusAreaKey(opts.focusAreaId, opts.trackId || '', opts.displayName || '');
  const fa = getFocusAreaById(focusKey);
  let entry = null;
  try {
    entry = getEntries({ focusArea: fa?.id || focusKey, profile: profileState.get() });
  } catch (_) {
    entry = null;
  }
  if (!entry) {
    return {
      kind: 'grounded_science',
      title: '',
      body: '',
      sourceLabel: '',
      focusAreaId: fa?.id || focusKey || null,
      maturityStage,
      noFact: true,
    };
  }
  return {
    kind: 'grounded_science',
    title: 'Grounded Science',
    body: String(entry.text),
    sourceLabel: String(entry.sourceLabel || ''),
    focusAreaId: fa?.id || focusKey || null,
    maturityStage,
    noFact: false,
  };
}

/**
 * STUB — Personal Insight detector.
 *
 * TODO(real-engine): Replace this stub with genuine detection of connections,
 * discrepancies, or trends in the user's own data for this Focus Area.
 * Return null when no genuine personal insight exists for this update cycle.
 *
 * Current behavior (placeholder):
 * - Stage 0 → always null (Personal Insight not eligible)
 * - Stage 1–3 → only return a mock insight when sensor_data has a clear numeric
 *   signal AND maturity allows labs at stage 3 for lab-ish keys
 *
 * @param {{
 *   maturityStage: number,
 *   focusAreaId?: string|null,
 *   trackId?: string,
 *   displayName?: string,
 *   sensorData?: Record<string, unknown>,
 *   ledgerStatus?: string,
 * }} opts
 * @returns {FeedContentSlot|null}
 */
export function detectPersonalInsight(opts) {
  const maturityStage = clampMaturityStage(opts.maturityStage ?? 0);
  // Stage 0: Personal Insight is never eligible — Grounded Science only.
  if (maturityStage < 1) return null;

  const sd = opts.sensorData && typeof opts.sensorData === 'object' ? opts.sensorData : {};
  const focusKey = resolveFocusAreaKey(opts.focusAreaId, opts.trackId || '', opts.displayName || '');

  const asNum = (...vals) => {
    for (const v of vals) {
      const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').trim());
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  // --- PLACEHOLDER RULES (swap for real engine) ---
  // Sleep: duration present → mock consistency insight
  if (focusKey === 'sleep') {
    const hours = asNum(sd.sleep_hours_total, sd.sleep_h, sd.sleep_hours, sd.hours);
    if (hours != null && hours > 0) {
      return {
        kind: 'personal_insight',
        title: 'Personal Insight',
        body: `Your logged sleep sits near ${hours.toFixed(1)} h. Watching timing consistency across the next few nights will tell us more than any single night — especially if Talk mentions fatigue or late screens.`,
        sourceLabel: 'Your sleep signals · placeholder detector',
        focusAreaId: focusKey,
        maturityStage,
      };
    }
  }

  // Movement: steps present
  if (focusKey === 'move') {
    const steps = asNum(sd.steps_total, sd.daily_steps, sd.steps);
    if (steps != null && steps > 0) {
      return {
        kind: 'personal_insight',
        title: 'Personal Insight',
        body: `You have ${Math.round(steps).toLocaleString()} steps on record for the latest window. Comparing this against your quieter and heavier days is the next useful personal signal — not a generic step goal.`,
        sourceLabel: 'Your movement signals · placeholder detector',
        focusAreaId: focusKey,
        maturityStage,
      };
    }
  }

  // Cardio: resting HR / HRV
  if (focusKey === 'cardio') {
    const rhr = asNum(sd.resting_hr_bpm, sd.resting_hr, sd.heart_rate_bpm);
    const hrv = asNum(sd.hrv_ms, sd.hrv);
    if (rhr != null || hrv != null) {
      const bits = [];
      if (rhr != null) bits.push(`resting HR ~${Math.round(rhr)} bpm`);
      if (hrv != null) bits.push(`HRV ~${Math.round(hrv)} ms`);
      return {
        kind: 'personal_insight',
        title: 'Personal Insight',
        body: `Latest cardio markers: ${bits.join(', ')}. Treat this as a personal trend seed — multi-day direction matters more than today’s snapshot.`,
        sourceLabel: 'Your cardio signals · placeholder detector',
        focusAreaId: focusKey,
        maturityStage,
      };
    }
  }

  // Stage 3 only: lab / biomarker-ish keys
  if (maturityStage >= 3) {
    const labKeys = Object.keys(sd).filter((k) =>
      /lab|biomarker|ldl|hdl|apo|a1c|glucose|crp|ferritin|vitamin/i.test(k)
    );
    if (labKeys.length) {
      return {
        kind: 'personal_insight',
        title: 'Personal Insight',
        body: `Biomarker fields are present for this Focus Area (${labKeys.slice(0, 3).join(', ')}). Stage 3 unlocks protocol-level interpretation against your labs — the real engine should ground recommendations in those values next.`,
        sourceLabel: 'Your biomarker signals · placeholder detector',
        focusAreaId: focusKey,
        maturityStage,
      };
    }
  }

  // Ledger status that looks like a genuine user-data insight (not empty/upload prompts)
  const status = String(opts.ledgerStatus || '').trim();
  if (
    status &&
    status.length > 24 &&
    !/searching|awaiting|upload|connect (a )?device|no data yet|please/i.test(status)
  ) {
    return {
      kind: 'personal_insight',
      title: 'Personal Insight',
      body: status,
      sourceLabel: 'Ledger insight · placeholder pass-through',
      focusAreaId: focusKey,
      maturityStage,
    };
  }

  return null;
}

/**
 * Single-slot resolver: Personal Insight (if eligible + found) else Grounded Science.
 * Never returns empty content.
 *
 * @param {{
 *   maturityStage?: number,
 *   focusAreaId?: string|null,
 *   trackId?: string,
 *   displayName?: string,
 *   sensorData?: Record<string, unknown>,
 *   ledgerStatus?: string,
 * }} opts
 * @returns {FeedContentSlot}
 */
export function resolveFeedContentSlot(opts = {}) {
  const maturityStage = clampMaturityStage(opts.maturityStage ?? 0);
  const insight = detectPersonalInsight({ ...opts, maturityStage });
  if (insight) return insight;
  return buildGroundedScience({ ...opts, maturityStage });
}

/**
 * Low Signal Confidence → Talk nudge (separate from content-slot priority).
 * @param {number} signalConfidencePct
 * @param {number} [threshold=50]
 * @returns {{ show: boolean, text: string }}
 */
export function buildSignalConfidenceNudge(signalConfidencePct, threshold = 50) {
  const pct = Math.round(Math.max(0, Math.min(100, Number(signalConfidencePct) || 0)));
  if (pct >= threshold) return { show: false, text: '' };
  return {
    show: true,
    text: 'Signal Confidence is low for this Focus Area — open Talk to add context or confirm recent data.',
  };
}
