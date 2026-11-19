/**
 * Task 15a-1 — verified library import + schema lint.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getLibraryEntries,
  validateLibrary,
  NUMBER_TEXT_ALLOWLIST,
  getEntries,
  isContentPreviewEnabled,
} from '../mobile-app/js/features/feed/content-library.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const NEW_IDS = [
  'sleep-duration-7h',
  'sleep-consistent-wake',
  'sleep-caffeine-late',
  'sleep-screens-evening',
  'sleep-light-cues',
  'sleep-bedroom',
  'sleep-evening-eating',
  'move-weekly-aerobic',
  'move-strength-2days',
  'move-some-better',
  'move-limit-sitting',
  'move-feel-sleep',
  'stress-breathe-stretch',
  'stress-talk',
  'stress-news-breaks',
  'stress-body-basics',
  'stress-relax-regular',
  'act-sleep-same-wake',
  'act-sleep-screens',
  'act-sleep-caffeine',
  'act-sleep-bedroom',
  'act-stress-breathe',
  'act-stress-talk',
  'act-stress-news-break',
  'act-move-walk',
  'act-move-strength',
  'act-move-sit-less',
];
const HIDDEN = new Set(['move-limit-sitting', 'act-move-sit-less']);

const draftPath = path.join(root, 'docs/library-sources/obrium-evidence-library-draft.json');
const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
if (!Array.isArray(draft.entries) || draft.entries.length !== 27) {
  fail(`reference draft must stay at 27 entries, got ${draft.entries?.length}`);
}

const entries = getLibraryEntries();
if (entries.length !== 89) fail(`expected 62+27=89 entries, got ${entries.length}`);

const byId = new Map(entries.map((e) => [e.id, e]));
for (const id of NEW_IDS) {
  if (!byId.has(id)) fail(`missing imported id ${id}`);
}

const schemaErrors = validateLibrary(entries);
for (const err of schemaErrors) fail(err);

const newEntries = NEW_IDS.map((id) => byId.get(id));
const shown = newEntries.filter((e) => e.reviewed === true);
const hidden = newEntries.filter((e) => e.reviewed === false);
if (shown.length !== 25) fail(`expected 25 reviewed new entries, got ${shown.length}`);
if (hidden.length !== 2) fail(`expected 2 hidden, got ${hidden.map((e) => e.id).join(',')}`);
for (const e of hidden) {
  if (!HIDDEN.has(e.id)) fail(`unexpected unreviewed ${e.id}`);
  if (e.sourceVerified !== true) fail(`${e.id} must still be sourceVerified`);
}
for (const e of shown) {
  if (e.sourceVerified !== true) fail(`${e.id} reviewed without sourceVerified`);
  if (!e.sourceUrl) fail(`${e.id} missing sourceUrl`);
  if (!e.sourceQuote) fail(`${e.id} missing sourceQuote`);
}
for (const e of newEntries) {
  if (e.focusArea === 'movement') fail(`${e.id} focusArea not mapped`);
}

if (!NUMBER_TEXT_ALLOWLIST.has('act-sleep-screens')) fail('act-sleep-screens not allowlisted');
if (!NUMBER_TEXT_ALLOWLIST.has('sleep-duration-7h')) fail('sleep-duration-7h not allowlisted');

const strictSleep = getEntries(
  { focusArea: 'sleep', profile: { body: { age: 30 } } },
  { hostname: 'example.com', search: '' }
);
if (!strictSleep || !strictSleep.reviewed) fail('strict mode did not return a reviewed sleep fact');
if (HIDDEN.has(strictSleep.id)) fail('strict mode returned a hidden entry');

const previewOff = isContentPreviewEnabled({ hostname: 'example.com', search: '?contentPreview=1' });
if (previewOff) fail('preview must stay loopback-only');

console.log('15a-1 shown', shown.map((e) => e.id).join(','));
console.log('15a-1 hidden', hidden.map((e) => e.id).join(','));
console.log('15a-1 allowlist', [...NUMBER_TEXT_ALLOWLIST].join(','));
if (failed) {
  console.error('TASK15A_1_FAIL');
  process.exit(1);
}
console.log('TASK15A_1_OK');
