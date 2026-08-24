// Serron — Talk Context Preparation
// @owner: talk
// @role: utils
// Gathers data from StorageManager (Master Record) and dayState for LLM system prompt.

import { storageManager } from '../../core/storage.js';
import { dayState } from '../../state.js';
import { getMessagesByType } from '../storage/message-queue.js';

const NOTES_LIMIT = 5;

/**
 * Get structured user profile for backend persona (name, age, location, goals).
 * Returns null if no profile data — backend will use Guest persona.
 * @returns {{ name?: string, age?: number, location?: string, goals?: string } | null}
 */
export function getUserProfile() {
  try {
    const record = storageManager.getRecord();
    if (!record) return null;

    const r = record.Registry || {};
    const l = record.Lifestyle || {};
    let location = null;
    if (r.location) {
      if (typeof r.location === 'string') location = r.location;
      else if (r.location.city) location = r.location.city;
      else if (r.location.zip) location = `ZIP ${r.location.zip}`;
    }
    const goalsParts = [];
    if (l.dietRules?.length) goalsParts.push(l.dietRules.join(', '));
    if (l.habits?.length) goalsParts.push(l.habits.join(', '));
    const goals = goalsParts.length ? goalsParts.join('; ') : null;

    const hasAny = r.name || r.age != null || location || goals;
    if (!hasAny) return null;

    return {
      name: r.name || undefined,
      age: r.age != null ? r.age : undefined,
      location: location || undefined,
      goals: goals || undefined
    };
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
  const parts = [];

  try {
    const record = storageManager.getRecord();
    if (!record) return '';

    const r = record.Registry || {};
    const c = record.Clinical || {};
    const l = record.Lifestyle || {};
    const v = record.Vitals || {};
    const s = record.Signals || {};

    if (r.name) parts.push(`Name: ${r.name}`);
    if (r.age != null) parts.push(`Age: ${r.age}`);
    if (r.gender) parts.push(`Gender: ${r.gender}`);
    if (r.location) {
      const loc = r.location;
      if (typeof loc === 'string') parts.push(`Location: ${loc}`);
      else if (loc && typeof loc === 'object') {
        if (loc.city) parts.push(`Location: ${loc.city}`);
        else if (loc.zip) parts.push(`Location: ZIP ${loc.zip}`);
        else if (loc.coords) parts.push(`Location: ${loc.coords.lat?.toFixed(2)}, ${loc.coords.lon?.toFixed(2)}`);
      }
    }
    if (r.bio) parts.push(`Bio: ${r.bio}`);

    if (v.currentWeight != null) parts.push(`Weight: ${v.currentWeight}`);
    if (v.height != null) parts.push(`Height: ${v.height}`);

    if (c.allergies?.length) parts.push(`Allergies: ${c.allergies.join(', ')}`);
    if (c.medications?.length) parts.push(`Medications: ${c.medications.join(', ')}`);
    if (c.diagnoses?.length) parts.push(`Diagnoses: ${c.diagnoses.join(', ')}`);

    if (l.dietRules?.length) parts.push(`Diet: ${l.dietRules.join(', ')}`);
    if (l.habits?.length) parts.push(`Habits: ${l.habits.join(', ')}`);
    if (l.restrictions?.length) parts.push(`Restrictions: ${l.restrictions.join(', ')}`);
    if (l.activityLevel) parts.push(`Activity: ${l.activityLevel}`);

    if (s.eventLog?.length) {
      const recent = s.eventLog.slice(-3).map(e => e.content || e.type).filter(Boolean);
      if (recent.length) parts.push(`Recent signals: ${recent.join(' | ')}`);
    }

    const day = dayState.get();
    if (day && typeof day === 'object') {
      const w = day.weather;
      if (w && (w.temperature != null || w.condition)) {
        const wParts = [];
        if (w.temperature != null) wParts.push(`${w.temperature}°F`);
        if (w.condition) wParts.push(w.condition);
        if (w.feelsLike != null) wParts.push(`Feels like ${w.feelsLike}°F`);
        parts.push(`Weather: ${wParts.join(', ')}`);
      }
      if (day.sleep?.hours != null) parts.push(`Sleep last night: ${day.sleep.hours}h`);
      if (day.energy) parts.push(`Energy: ${day.energy}`);
    }

    const feedMsgs = getMessagesByType('feed') || [];
    const talkMsgs = getMessagesByType('talk') || [];
    const recent = [...feedMsgs, ...talkMsgs]
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, NOTES_LIMIT);
    if (recent.length > 0) {
      const noteTexts = recent.map(m => (m.text || '').trim()).filter(Boolean);
      if (noteTexts.length) parts.push(`Recent activity: ${noteTexts.join(' | ')}`);
    }
  } catch (_) {
    // Silently fail — context is optional
  }

  return parts.length ? parts.join('. ') : '';
}
