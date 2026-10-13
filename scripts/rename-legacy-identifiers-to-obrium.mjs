/**
 * One-off (Task 7 C2): rename legacy identifiers that are only referenced inside this repo to Obrium equivalents.
 * Uses the classifier from inventory-legacy-names.mjs; storage keys, env/runtime config, the tendai-backend folder,
 * comments, docs and legacy-name sanitizers are left alone.
 * Usage: node scripts/rename-legacy-identifiers-to-obrium.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { root, textFiles, TOKEN, classify } from './inventory-legacy-names.mjs';

const APPLY = process.argv.includes('--apply');
const SAFE = new Set([
  'DOM id / class / data-attr / keyframes',
  'window/global identifier',
  'event name',
  'internal variable/function/const',
  'string literal (log/UA/other)',
  'other',
  'package.json name/keywords',
]);
/** Test scripts use bare legacy names as leak detectors (/TendAI/i.test(reply)); only app identifiers follow the rename there. */
const SAFE_IN_SCRIPTS = new Set(['DOM id / class / data-attr / keyframes', 'window/global identifier', 'event name']);
const SKIP_FILES = new Set(['tendai-backend/package.json', 'tendai-backend/.env.example']);

const toObrium = (s) =>
  s
    .replace(/SereginOS|Seregin/g, 'Obrium')
    .replace(/TendAI|Tendai|Serron/g, 'Obrium')
    .replace(/TENDAI|SERRON/g, 'OBRIUM')
    .replace(/tendai|serron/g, 'obrium');

let changed = 0;
for (const f of textFiles) {
  if (SKIP_FILES.has(f) || /^scripts\/(rename-|scan-brand)/.test(f) || /\.md$/i.test(f)) continue;
  const abs = path.join(root, f);
  const src = fs.readFileSync(abs, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let fileChanged = false;
  const out = src.split(/\r?\n/).map((line, i) => {
    const allowed = f.startsWith('scripts/') ? SAFE_IN_SCRIPTS : SAFE;
    const next = line.replace(TOKEN, (tok) => (allowed.has(classify(f, tok, line)) ? toObrium(tok) : tok));
    if (next !== line) {
      fileChanged = true;
      changed++;
      if (!APPLY) console.log(`${f}:${i + 1}\n  - ${line.trim().slice(0, 150)}\n  + ${next.trim().slice(0, 150)}`);
    }
    return next;
  });
  if (fileChanged && APPLY) fs.writeFileSync(abs, out.join(eol));
}
console.log(`${APPLY ? 'Changed' : 'Would change'} ${changed} line(s).`);
