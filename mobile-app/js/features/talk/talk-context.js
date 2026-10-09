// Serron — Talk Context Preparation
// @owner: talk
// @role: utils
// Gathers data from StorageManager (Master Record) and dayState for LLM system prompt.

import { storageManager } from '../../core/storage.js';
import { dayState } from '../../state.js';
import { getMessagesByType } from '../storage/message-queue.js';

const RECENT_PROMPTS_LIMIT = 2;
const RECENT_PROMPT_MAX_CHARS = 120;

const VALUE_LABELS = {
  'prefer-not-say': 'prefer not to say',
  'not-sure': 'not sure',
  '<6months': 'less than 6 months ago',
  '6-12months': '6–12 months ago',
  '>1year': 'more than a year ago',
  '1-2x-week': '1–2 times a week',
  '3+x-week': '3+ times a week',
  'probably-low': 'probably low',
};

/** Human-readable form of a stored option value ("heart-health" → "heart health"). */
function humanize(value) {
  if (Array.isArray(value)) return value.map(humanize).filter(Boolean).join(', ');
  if (value == null) return '';
  const s = String(value).trim();
  if (VALUE_LABELS[s]) return VALUE_LABELS[s];
  return s.replace(/([a-z])-(?=[a-z])/gi, '$1 ');
}

function hasValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function formatLocation(loc) {
  if (!loc) return null;
  if (typeof loc === 'string') return loc;
  if (loc.city) return loc.city;
  if (loc.zip) return `ZIP ${loc.zip}`;
  if (loc.coords) return `${loc.coords.lat?.toFixed(2)}, ${loc.coords.lon?.toFixed(2)}`;
  return null;
}

/** Goals & Intent answers only (primary goals + per-section primary goals). */
function collectStatedGoals(g) {
  const goals = [];
  if (Array.isArray(g.primaryGoals)) goals.push(...g.primaryGoals.map(humanize));
  const sectionGoals = g.sectionGoals && typeof g.sectionGoals === 'object' ? g.sectionGoals : {};
  for (const entry of Object.values(sectionGoals)) {
    if (entry && entry.focus) goals.push(humanize(entry.focus));
  }
  return [...new Set(goals.filter(Boolean))];
}

/** Diet: stated eating answers + diet rules learned from Talk. */
function collectDiet(l) {
  const diet = [];
  if (hasValue(l.dietType)) diet.push(`diet type ${humanize(l.dietType)}`);
  if (hasValue(l.eatingPattern)) diet.push(`eating pattern ${humanize(l.eatingPattern)}`);
  if (hasValue(l.enoughProtein)) diet.push(`enough protein: ${humanize(l.enoughProtein)}`);
  if (hasValue(l.sugarSweets)) diet.push(`sugar/sweets ${humanize(l.sugarSweets)}`);
  if (hasValue(l.lateEating)) diet.push(`late eating ${humanize(l.lateEating)}`);
  if (hasValue(l.hydration)) diet.push(`hydration ${humanize(l.hydration)}`);
  if (hasValue(l.dietRules)) diet.push(...l.dietRules.map(String));
  return diet;
}

/** Habits: substance use + habits learned from Talk. */
function collectHabits(l) {
  const habits = [];
  if (hasValue(l.smoking)) habits.push(`smoking ${humanize(l.smoking)}`);
  if (hasValue(l.alcohol)) habits.push(`alcohol ${humanize(l.alcohol)}`);
  if (hasValue(l.habits)) habits.push(...l.habits.map(String));
  return habits;
}

/**
 * Structured user profile for the backend persona.
 * `goals` holds only Goals & Intent answers; diet and habits are separate fields.
 * Returns null if no profile data — backend will use Guest persona.
 * @returns {{ name?: string, age?: number, location?: string, goals?: string[], wantFromObrium?: string, motivationLevel?: number, diet?: string[], habits?: string[] } | null}
 */
export function getUserProfile() {
  try {
    const record = storageManager.getRecord();
    if (!record) return null;

    const r = record.Registry || {};
    const l = record.Lifestyle || {};
    const g = record.Goals || {};
    const location = formatLocation(r.location);
    const goals = collectStatedGoals(g);
    const diet = collectDiet(l);
    const habits = collectHabits(l);

    const profile = {};
    if (r.name) profile.name = r.name;
    if (r.age != null) profile.age = r.age;
    if (location) profile.location = location;
    if (goals.length) profile.goals = goals;
    if (hasValue(g.wantFromObrium)) profile.wantFromObrium = humanize(g.wantFromObrium);
    if (g.motivationLevel != null) profile.motivationLevel = g.motivationLevel;
    if (diet.length) profile.diet = diet;
    if (habits.length) profile.habits = habits;

    return Object.keys(profile).length ? profile : null;
  } catch (_) {
    return null;
  }
}

/**
 * Gather system context from Master Record and day state for the LLM.
 * Reads from StorageManager.getRecord() — no raw localStorage.
 * @returns {string} Formatted context for System Prompt
 */
export function getSystemContext() {
  return getSystemContextDetails().text;
}

/**
 * Same context as getSystemContext, plus the data categories it contains (for the data-sent log).
 * @returns {{ text: string, categories: string[] }}
 */
export function getSystemContextDetails() {
  const parts = [];
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  const note = (group, label) => {
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(label);
  };
  const categories = () => [...groups].map(([group, labels]) => `${group}: ${labels.join(', ')}`);

  try {
    const record = storageManager.getRecord();
    if (!record) return { text: '', categories: [] };

    const r = record.Registry || {};
    const c = record.Clinical || {};
    const l = record.Lifestyle || {};
    const v = record.Vitals || {};
    const m = record.Mind || {};
    const sl = record.Sleep || {};
    const g = record.Goals || {};
    const s = record.Signals || {};
    const add = (group, label, value, suffix = '') => {
      if (!hasValue(value)) return;
      parts.push(`${label}: ${humanize(value)}${suffix}`);
      note(group, label);
    };
    const addRaw = (group, label, text) => {
      parts.push(`${label}: ${text}`);
      note(group, label);
    };

    // Identity, goals, diet and habits travel as structured userProfile fields (getUserProfile).
    add('body', 'Sex at birth', r.sexAtBirth);
    add('body', 'Gender identity', r.genderIdentity);
    if (!r.genderIdentity) add('body', 'Gender', r.gender);
    if (r.bio) addRaw('body', 'Bio', r.bio);

    if (v.height != null) addRaw('body', 'Height', `${v.height} cm`);
    if (v.currentWeight != null) addRaw('body', 'Weight', `${v.currentWeight} kg`);
    add('body', 'Body build', v.bodyBuild);
    add('body', 'Blood type', v.bloodType);
    add('activity', 'Physical activity', l.physicalActivity);
    add('activity', 'Regular discomfort', l.regularDiscomfort);
    if (l.activityLevel) addRaw('activity', 'Active days per week', l.activityLevel);

    add('health', 'Health conditions', c.healthConditions);
    add('health', 'Diagnoses', c.diagnoses);
    add('health', 'Takes prescription medications', c.prescriptionMedications);
    add('health', 'Medications', c.medications);
    add('health', 'Supplements', c.supplements);
    add('health', 'Allergies', c.allergies);
    add('health', 'Last general checkup', c.lastCheckup);
    add('health', 'Restrictions', l.restrictions);

    add('mind', 'Stress level', m.stressLevel, ' (1 very calm – 5 very stressed)');
    add('mind', 'Mental energy', m.mentalEnergy, ' (1 clear – 5 exhausted)');
    add('mind', 'Anxiety', m.anxietyFrequency);
    add('mind', 'Mood changes', m.moodChanges);
    add('mind', 'Wants to improve focus', m.wantToImproveFocus);

    add('sleep profile', 'Usual sleep duration', sl.duration);
    add('sleep profile', 'Sleep quality', sl.quality, ' (1–5)');

    add('goal notes', 'Must consider', g.constraints);
    add('goal notes', 'Notes', g.notes);

    if (s.eventLog?.length) {
      const recent = s.eventLog
        .filter(e => e && e.type !== 'HISTORY_SYNC_PLACEHOLDER')
        .slice(-3)
        .map(e => e.content || e.type)
        .filter(Boolean);
      if (recent.length) addRaw(`logged signals`, 'Recent signals', recent.join(' | '));
    }

    const day = dayState.get();
    if (day && typeof day === 'object') {
      const w = day.weather;
      if (w && (w.temperature != null || w.condition)) {
        const wParts = [];
        if (w.temperature != null) wParts.push(`${w.temperature}°F`);
        if (w.condition) wParts.push(w.condition);
        if (w.feelsLike != null) wParts.push(`Feels like ${w.feelsLike}°F`);
        addRaw('today', 'Weather', wParts.join(', '));
      }
      if (day.sleep?.hours != null) addRaw('today', 'Sleep last night', `${day.sleep.hours}h`);
      if (day.energy) addRaw('today', 'Energy', day.energy);
    }

    // Feed notification texts are app-generated and not sent; only the latest Talk prompts from the
    // last day are kept (short), so a reply like "yes, did that" still has its context.
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const prompts = (getMessagesByType('talk') || [])
      .filter((msg) => new Date(msg.timestamp || 0).getTime() >= dayAgo)
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, RECENT_PROMPTS_LIMIT)
      .map((msg) => truncate(msg.text, RECENT_PROMPT_MAX_CHARS))
      .filter(Boolean);
    if (prompts.length) addRaw('recent app prompts', `Recent Obrium prompts (${prompts.length})`, prompts.join(' | '));
  } catch (_) {
    // Silently fail — context is optional
  }

  return { text: parts.length ? parts.join('. ') : '', categories: categories() };
}

function truncate(text, max) {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
