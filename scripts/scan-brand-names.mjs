/**
 * Scan for legacy brand names (TendAI / Serron / Seregin OS) and classify each hit as
 * user-facing candidate vs. intentionally preserved internal identifier.
 * Usage: node scripts/scan-brand-names.mjs [--all]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const showAll = process.argv.includes('--all');

const ROOTS = ['mobile-app', 'tendai-backend'];
const SKIP_DIRS = new Set(['node_modules', '_audit', 'android', 'ios', '.git']);
const EXTS = new Set(['.js', '.mjs', '.html', '.json', '.css']);
const SKIP_FILES = new Set(['package-lock.json']);

const NAME_RE = /seregin\s*os|seregin|serron|tendai/gi;

/** Each rule: [category, regex tested against the matched token in its line context]. */
const INTERNAL_RULES = [
  ['storage key', /['"`](tendai|serron)[_-][\w-]*/i],
  ['storage key', /TendAI_MasterRecord|TendAIDB|tendai[-_]biometrics/i],
  ['event name', /['"`](Tendai|Serron|serron|tendai):[\w-]+/],
  ['event name', /['"`]serron[-_:][\w-]*/],
  ['env/global var', /\b(window\.)?(__serron\w*|__tendai\w*|SERRON_\w+|TENDAI_\w+|Serron\w*|TendAI\w*|Tendai\w*|tendai\w*|serron\w*)\b/],
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(entry.name)) && !SKIP_FILES.has(entry.name)) out.push(full);
  }
}

function isCommentLine(line, ext) {
  const t = line.trim();
  if (ext === '.css') return t.startsWith('/*') || t.startsWith('*');
  if (ext === '.html' && t.startsWith('<!--')) return true;
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('/**');
}

function classify(line, ext, matchIndex, token) {
  if (isCommentLine(line, ext)) return 'code comment';
  const before = line.slice(0, matchIndex);
  if (/\/\/[^'"`]*$/.test(before) && !/['"`][^'"`]*$/.test(before)) return 'code comment';
  if (/\/\*[^*]*$/.test(before)) return 'code comment';
  if (/<!--(?!.*-->)/.test(before)) return 'code comment';
  if (ext === '.css') return 'css class/var';
  if (/console\.(log|warn|error|info|debug)\(/.test(line)) return 'console log';
  if (/@tendai\.app|tendai\.app/i.test(line) && /tendai\.app/i.test(line.slice(matchIndex, matchIndex + 12))) return 'email/domain';
  if (/appId/.test(line)) return 'capacitor appId';
  if (/\b(import|from)\b.*['"].*tendai/i.test(line)) return 'file path';
  if (/['"`][^'"`]*\/[^'"`]*tendai[^'"`]*\.(js|css)/i.test(line)) return 'file path';
  const after = line.slice(matchIndex + token.length);
  if (/^[-_][\w-]/.test(after) && /(class|id|querySelector|getElementById|classList|data-|\.|#|['"`\s])$/.test(before.slice(-12) || ' ')) {
    if (/(class(Name)?\s*=|classList|querySelector|getElementById|id\s*=|data-)/.test(line)) return 'dom id/class';
  }
  if (/^[-_][\w-]/.test(after) && /['"`]$/.test(before)) return 'storage key';
  if (/^[-_][\w-]/.test(after) && /(class|id)=["'][^"']*$/.test(before)) return 'dom id/class';
  if (/^:[\w-]/.test(after) && /['"`]$/.test(before)) return 'event name';
  if (/^\w/.test(after) || /\w$/.test(before)) return 'identifier';
  if (/^_\w/.test(after)) return 'identifier';
  if (/__$/.test(before)) return 'identifier';
  if (/(window|globalThis)\.$/.test(before)) return 'identifier';
  if (/\.$/.test(before) && !/['"`][^'"`]*$/.test(before)) return 'identifier';
  return 'USER-FACING?';
}

const files = [];
for (const r of ROOTS) walk(path.join(root, r), files);

const buckets = new Map();
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const ext = path.extname(file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    NAME_RE.lastIndex = 0;
    let m;
    while ((m = NAME_RE.exec(line))) {
      const cat = classify(line, ext, m.index, m[0]);
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat).push(`${rel}:${i + 1}: ${line.trim().slice(0, 180)}`);
    }
  });
}

const order = ['USER-FACING?', ...[...buckets.keys()].filter((k) => k !== 'USER-FACING?').sort()];
for (const cat of order) {
  const rows = buckets.get(cat);
  if (!rows) continue;
  console.log(`\n=== ${cat} (${rows.length}) ===`);
  if (cat === 'USER-FACING?' || showAll) rows.forEach((r) => console.log(r));
}
