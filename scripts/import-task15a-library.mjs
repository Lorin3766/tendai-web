/**
 * Task 15a-1: append verified draft entries to the closed library.
 * Reference draft is never edited: docs/library-sources/obrium-evidence-library-draft.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftPath = path.join(root, 'docs/library-sources/obrium-evidence-library-draft.json');
const libPath = path.join(root, 'mobile-app/js/features/feed/content-library.json');

const AREA_MAP = { sleep: 'sleep', stress: 'stress', movement: 'move', move: 'move' };
/** Stay reviewed:false until WHO citation confirmed. */
const UNREVIEWED_IDS = new Set(['move-limit-sitting', 'act-move-sit-less']);

const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
const lib = JSON.parse(fs.readFileSync(libPath, 'utf8'));
const existingIds = new Set((lib.entries || []).map((e) => e.id));

const factsById = new Map();
for (const e of draft.entries) {
  if (e.kind !== 'action') factsById.set(e.id, e);
}

const incoming = [];
for (const raw of draft.entries) {
  if (existingIds.has(raw.id)) {
    console.error('duplicate id already in library:', raw.id);
    process.exit(1);
  }
  const area = AREA_MAP[raw.focusArea];
  if (!area) {
    console.error('unmapped focusArea', raw.focusArea, raw.id);
    process.exit(1);
  }
  const reviewed = !UNREVIEWED_IDS.has(raw.id);
  const entry = {
    id: raw.id,
    kind: raw.kind === 'action' ? 'action' : 'fact',
    focusArea: area,
    text: raw.text,
    sourceLabel: raw.sourceLabel || '',
    sourceVerified: true,
    evidenceLevel: raw.evidenceLevel || (raw.kind === 'action' ? 'observational' : 'guideline'),
    reviewed,
  };
  if (entry.kind === 'fact') {
    entry.field = raw.field == null ? null : raw.field;
    entry.appliesWhen =
      raw.appliesWhen && typeof raw.appliesWhen === 'object' ? raw.appliesWhen : {};
    entry.sourceUrl = raw.sourceUrl || '';
    entry.sourceQuote = raw.sourceQuote || '';
    if (raw.caveat) entry.caveat = raw.caveat;
  } else {
    entry.slot = raw.slot;
    entry.effort = raw.effort;
    entry.basedOn = raw.basedOn;
    const base = factsById.get(raw.basedOn);
    if (!entry.sourceLabel && base) entry.sourceLabel = base.sourceLabel;
    if (!entry.sourceLabel) entry.sourceLabel = 'to be verified';
    entry.evidenceLevel = 'observational';
    // Schema: reviewed entries need sourceUrl + sourceQuote (inherit from basedOn).
    entry.sourceUrl = base?.sourceUrl || '';
    entry.sourceQuote = base?.sourceQuote || '';
    if (base?.caveat) entry.caveat = base.caveat;
  }
  incoming.push(entry);
  existingIds.add(entry.id);
}

lib.entries = [...(lib.entries || []), ...incoming];
fs.writeFileSync(libPath, JSON.stringify(lib, null, 2) + '\n');

const shown = incoming.filter((e) => e.reviewed).map((e) => e.id);
const hidden = incoming.filter((e) => !e.reviewed).map((e) => e.id);
console.log(
  JSON.stringify(
    {
      total: lib.entries.length,
      added: incoming.length,
      shown: shown.length,
      hidden,
      shownIds: shown,
    },
    null,
    2
  )
);
