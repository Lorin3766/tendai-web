/**
 * Task 9 Part 1 checks. 9b is always run; 9a/9c sections are added in later commits.
 * Usage: node scripts/verify-task9-part1.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getLibraryEntries,
  getEntries,
  isContentPreviewEnabled,
  validateLibrary,
} from '../mobile-app/js/features/feed/content-library.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const FORBIDDEN = [
  /diagnos/i,
  /\bcure\b/i,
  /\btreat/i,
  /prevent\w*\s+disease/i,
  /\bdose\b/i,
  /\bdosage\b/i,
  /\bmedication\b/i,
];

const entries = getLibraryEntries();
const schemaErrors = validateLibrary(entries);
for (const err of schemaErrors) fail(err);
console.log(`[9b] ${entries.length} entries, schema errors: ${schemaErrors.length}`);

const texts = entries.map((e) => e.text.trim());
if (new Set(texts).size !== texts.length) fail('duplicate entry text');
for (const e of entries) {
  for (const re of FORBIDDEN) {
    if (re.test(e.text)) fail(`${e.id} forbidden: ${re}`);
  }
  if (e.reviewed !== false || e.sourceVerified !== false) fail(`${e.id} shipped reviewed or source-verified`);
}

const profile = { body: { name: 'Ada', birthYear: 1983 } };
const strict = getEntries({ focusArea: 'sleep', profile }, { hostname: '127.0.0.1', search: '' });
console.log('[9b] strict mode:', strict);
if (strict !== null) fail('strict mode returned an unreviewed entry');

const prodPreview = getEntries(
  { focusArea: 'sleep', profile },
  { hostname: 'obrium.app', search: '?contentPreview=1' },
);
if (prodPreview !== null) fail('preview enabled off localhost');
if (isContentPreviewEnabled({ hostname: 'localhost', search: '?contentPreview=1' }) !== true) {
  fail('localhost preview guard');
}
if (isContentPreviewEnabled({ hostname: '127.0.0.1', search: '?contentPreview=0' }) !== false) {
  fail('preview flag must be exactly 1');
}

const day = new Date(2026, 9, 16);
const a = getEntries({ focusArea: 'sleep', profile, now: day }, { hostname: 'localhost', search: '?contentPreview=1' });
const b = getEntries({ focusArea: 'sleep', profile, now: day }, { hostname: 'localhost', search: '?contentPreview=1' });
const other = getEntries(
  { focusArea: 'sleep', profile: { body: { name: 'Other', birthYear: 1999 } }, now: day },
  { hostname: 'localhost', search: '?contentPreview=1' },
);
console.log('[9b] preview fact:', a?.id, 'stable', a?.id === b?.id);
if (!a || a.id !== b.id) fail('fact not stable for the same profile and date');
if (!a.text || a.text.length > 220) fail('preview fact missing or too long');
if (other && other.focusArea !== 'sleep') fail('wrong area');

const raw = readFileSync(path.join(root, 'mobile-app/js/features/feed/content-library.json'), 'utf8');
if (!raw.includes('"reviewed": false')) fail('library JSON missing reviewed false');

if (failed) process.exit(1);
console.log('TASK9_PART1_OK');
