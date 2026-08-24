/**
 * Talk → Protocol Engine: scan AI replies for suggested routines (habit/supplement + time).
 */

const HABIT_HINT =
  /\b(supplement|supplements|vitamin|vitamins|habit|habits|routine|routines|omega|magnesium|zinc|probiotic|melatonin|meditat|stretch|journal|walk|workout|exercise|hydrat|protein|ashwagandh|creatine|collagen)\b/i;

const RELATIVE_TIME =
  /\b(in\s+the\s+)?(early\s+|late\s+)?(morning|afternoon|evening|night|noon|midnight|bedtime|before\s+bed|after\s+(breakfast|lunch|dinner)|with\s+(breakfast|lunch|dinner))\b/i;

const CLOCK = /\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?|am|pm)?\b/i;
const CLOCK_HOUR = /\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?|am|pm)\b/i;

function normalizeKeyPart(s) {
  return String(s || '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/** Stable id for { label, time } so duplicates are not added with different ids. */
export function protocolIdForRoutine(label, time) {
  return `protocol-os-${simpleHash(normalizeKeyPart(label) + '|' + normalizeKeyPart(time))}`;
}

function titleCaseWords(raw) {
  const words = String(raw || '')
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((w) => {
      if (/^(am|pm|or|and)$/i.test(w)) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * If the text suggests a new routine (habit/supplement language + clock or relative time),
 * returns { label, time }; otherwise null.
 */
export function extractRoutineSuggestionFromText(text) {
  const s = String(text || '').trim();
  if (!s || !HABIT_HINT.test(s)) return null;

  let timeStr = null;
  let m = s.match(CLOCK);
  if (m) timeStr = m[0].replace(/\s+/g, ' ').trim();
  else {
    m = s.match(CLOCK_HOUR);
    if (m) timeStr = m[0].replace(/\s+/g, ' ').trim();
  }
  if (!timeStr) {
    m = s.match(RELATIVE_TIME);
    if (m) timeStr = m[0].replace(/\s+/g, ' ').trim();
  }
  if (!timeStr) return null;

  const labelPatterns = [
    /(?:take|try|add|start|use|drink|consider)\s+(?:your\s+|a\s+|an\s+)?([a-z0-9][a-z0-9\s\-]{1,48}?)\s+(?:at|@|around|every|each|in\s+the)\s+/i,
    /(?:supplement|vitamin|habit|routine)\s*(?:[:\-]|[—–]\s*)\s*([a-z0-9][a-z0-9\s\-]{1,48}?)(?:\.|,|\s+(?:at|@|in\s+the|every)\s+)/i,
    /\b([A-Z][a-z]+(?:\s+[a-z]{2,}){0,3})\s+(?:under|before|at|@|in\s+the)\s+/,
  ];

  let label = null;
  for (const re of labelPatterns) {
    const mm = s.match(re);
    if (mm && mm[1]) {
      label = mm[1].replace(/\s+/g, ' ').trim();
      label = label.replace(/\s+(?:at|in|every|with)\s*$/i, '').trim();
      if (label.length >= 2 && label.length <= 72) break;
      label = null;
    }
  }

  if (!label) {
    const mRel = s.match(
      /\b([a-z][a-z0-9\s\-]{2,50})\s+in\s+the\s+(morning|afternoon|evening|night)\b/i
    );
    if (mRel) label = mRel[1].trim();
  }

  if (!label) {
    const habitMatch = s.match(HABIT_HINT);
    if (habitMatch) {
      const after = s.slice(habitMatch.index + habitMatch[0].length, habitMatch.index + habitMatch[0].length + 90);
      const capture = after.match(/^\s*(?:with\s+|like\s+)?([a-z][a-z0-9\s\-]{2,40}?)(?:\.|,|\s+at\s+|\s+in\s+the\s+)/i);
      if (capture) label = capture[1].trim();
    }
  }

  if (!label || label.length < 2) label = 'Routine';

  label = label
    .replace(/^(?:taking|trying|adding|starting|using|drinking|having)\s+/i, '')
    .replace(/^(?:a|an|the|your)\s+/i, '')
    .trim() || label;

  return { label: titleCaseWords(label), time: timeStr };
}
