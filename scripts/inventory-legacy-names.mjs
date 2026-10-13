/**
 * Inventory of legacy product names (TendAI / Serron / Seregin) left in the repo, grouped by category.
 * Usage: node scripts/inventory-legacy-names.mjs [--detail <category>] [--literals]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git']);
const TEXT_EXT = /\.(js|mjs|cjs|json|html|css|md|txt|yml|yaml|example|env)$/i;
const TOKEN = /[A-Za-z0-9_$.\-:]*(?:serron|tendai|seregin)[A-Za-z0-9_\-:]*/gi;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(root).map((p) => path.relative(root, p).replace(/\\/g, '/'));
const SELF = 'scripts/inventory-legacy-names.mjs';
const RENAMER = 'scripts/rename-legacy-identifiers-to-obrium.mjs';
const textFiles = files.filter((f) => (TEXT_EXT.test(f) || path.basename(f).startsWith('.env')) && !/package-lock\.json$/.test(f) && f !== SELF && f !== RENAMER);

/** Persisted keys and persisted schema fields: never renamed (would orphan existing users' data). */
const STORAGE = [
  /^tendai_[a-z0-9_]*$/,
  /^tendai-(profile-state|day-state|location|weather-cache|message-queue|theme|notifications|collapse-(left|right|center|mobile)|assistant-state|calendar-events|calendar-reminder-log|streak|selected-date|signal-journal|app-state|feed-state|talk-state|unread-items|integrity-state|human-os-baseline|display-name|shell-v1)$/,
  /^TendAI_MasterRecord$/,
  /^TendAIDB$/,
  /wantFromTendAI$/i,
];
const SANITIZER_FILES = new Set(['mobile-app/components/talk.js', 'tendai-backend/services/talkSystemPrompt.js', 'tendai-backend/routes/feed-advice.js']);

function classify(file, token, line) {
  const t = token.replace(/^[.:$\-]+|[.:\-]+$/g, '');
  const bare = t.replace(/^(window|document|process\.env)\./, '');
  if (/^(SERRON|TENDAI)_(URL|BACKEND_URL|BACKEND_BEARER|TALK_BEARER)$/.test(bare)) return 'env-or-runtime-config (risky)';
  if (/tendai\.app/i.test(t) || /com\.tendai/i.test(t) || /@tendai\.app/.test(line)) return 'email-domain / appId (out of scope)';
  if (STORAGE.some((re) => re.test(bare.replace(/^.*\./, '')) || re.test(bare))) return 'storage-key (keep)';
  if (/^(goals|goalsData|profileData\.goals)?\.?wantFromTendAI$/.test(t) || /goalsWantFromTendAI/.test(t)) return 'storage-key (keep)';
  if (t === 'tendai' && /startsWith\('tendai'\)|value="tendai"|type === 'tendai'|^\s*tendai:/.test(line)) return 'storage-key (keep)';
  if (/service: 'tendai-backend'|"service": "tendai-backend"/.test(line)) return 'health-check response value (risky)';
  if (/^tendai-backend$/.test(t) || /cd tendai-backend/.test(line)) return 'folder name: tendai-backend (risky)';
  if (file === 'tendai-backend/package.json') return 'backend package name/keywords (risky)';
  if (file === 'package.json') return 'package.json name/keywords';
  if (SANITIZER_FILES.has(file) && /Serron|TendAI|Tendai|Seregin|Tend\[/.test(line) && !/__serron|serron:|SERRON_|Tendai:|TendAIHumanOS/.test(t)) return 'legacy-name sanitizer / prompt (keep)';
  if (/^scripts\/(rename-|scan-brand)/.test(file)) return 'one-off rename/scan scripts';
  if (/\.md$/i.test(file)) return 'docs (.md)';
  if (/^--serron/.test(t)) return 'CSS custom property';
  if (/^(serron|Tendai):[A-Za-z]/.test(t)) return 'event name';
  if (/^\.?(serron|tendai)-[a-z]/.test(t) || /^data-tendai/.test(t) || /dataset\.tendai/.test(t) || /serronAgentCardEnter/.test(t)) return 'DOM id / class / data-attr / keyframes';
  if (/^(window\.|document\.)?(__serron|__SERRON|SERRON_BOOT|TENDAI_BOOT|tendai[A-Z]|TendAI[A-Z]|Serron[A-Z]|SereginOS|__tendai|exportTendAI|wipeTendAI)/.test(bare) || /^(window|document)\./.test(t)) return 'window/global identifier';
  if (/^(SERRON_[A-Z_]+|serron[A-Z]\w*|tendai[A-Z]\w*|releaseTendai\w*|dispatchTendai\w*|installTendai\w*|__serron\w*)$/.test(bare)) return 'internal variable/function/const';
  if (/^(Serron|TendAI|Tendai|Seregin|SERRON|TENDAI)$/.test(t) || /^TendAI-PWA-Weather/.test(t)) {
    if (/^\s*(\/\/|\*|\/\*|<!--|#)/.test(line) || /\/\*.*\*\//.test(line) || (/\.css$/.test(file) && !/[:{;]/.test(line))) return 'code comment';
    if (/scripts\//.test(file)) return 'legacy-name leak detectors in tests (keep)';
    return 'string literal (log/UA/other)';
  }
  if (/scripts\//.test(file)) return 'legacy-name leak detectors in tests (keep)';
  return 'other';
}

export { root, textFiles, files, TOKEN, classify };

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const results = new Map();
for (const f of isMain ? textFiles : []) {
  const lines = fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(TOKEN)) {
      const cat = classify(f, m[0], line);
      if (!results.has(cat)) results.set(cat, []);
      results.get(cat).push({ file: f, line: i + 1, token: m[0], text: line.trim().slice(0, 140) });
    }
  });
}
const nameHits = files.filter((f) => f !== SELF && f !== RENAMER).filter((f) => /serron|tendai|seregin/i.test(path.basename(f)));
const isOneOff = (f) => /^scripts\/(rename-|scan-brand)/.test(f);
if (nameHits.some(isOneOff)) results.set('one-off rename/scan scripts (file names)', nameHits.filter(isOneOff).map((f) => ({ file: f, line: 0, token: path.basename(f), text: '' })));
results.set('file names', nameHits.filter((f) => !isOneOff(f)).map((f) => ({ file: f, line: 0, token: path.basename(f), text: '' })));

const arg = process.argv.indexOf('--detail');
if (!isMain) {
  // imported by the rename script
} else if (arg > -1) {
  const want = process.argv[arg + 1];
  for (const [cat, hits] of results) {
    if (!cat.startsWith(want)) continue;
    const byToken = {};
    for (const h of hits) (byToken[h.token] ||= []).push(`${h.file}:${h.line}`);
    console.log(`== ${cat} ==`);
    for (const [tok, locs] of Object.entries(byToken).sort((a, b) => b[1].length - a[1].length)) console.log(`${String(locs.length).padStart(4)} ${tok}  (${[...new Set(locs.map((l) => l.split(':')[0]))].slice(0, 4).join(', ')})`);
  }
} else {
  let total = 0;
  for (const [cat, hits] of [...results].sort((a, b) => b[1].length - a[1].length)) {
    total += hits.length;
    console.log(`${String(hits.length).padStart(5)}  ${cat}  (${new Set(hits.map((h) => h.file)).size} files)`);
  }
  console.log(`${String(total).padStart(5)}  TOTAL`);
}
