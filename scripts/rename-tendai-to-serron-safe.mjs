/**
 * Rename TendAI → Serron for safe non-persisted internals only.
 * Skips localStorage/IDB keys, tendai-backend paths, and Capacitor appId.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.md', '.example']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'android',
  'ios',
  '_audit',
  'agent-transcripts',
]);

/** Protect these substrings from any tendai→serron mangling. */
const PROTECT = [
  /tendai_[a-z0-9_]+/gi, // localStorage / persisted keys
  /TendAI_MasterRecord/g,
  /tendai-backend/g,
  /tendai_local_db/g,
  /com\.tendai\.app/g,
  /tendai-pwa/g, // leave lockfile/name unless we rewrite package.json separately
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (EXT.has(path.extname(ent.name))) out.push(p);
  }
  return out;
}

function withPlaceholders(src, fn) {
  const held = [];
  let s = src;
  for (const re of PROTECT) {
    s = s.replace(re, (m) => {
      const i = held.length;
      held.push(m);
      return `\u0000PROT${i}\u0000`;
    });
  }
  s = fn(s);
  s = s.replace(/\u0000PROT(\d+)\u0000/g, (_, i) => held[Number(i)]);
  return s;
}

function transform(src, file) {
  return withPlaceholders(src, (s) => {
    s = s.replace(/SERRON_BOOT_READY/g, 'SERRON_BOOT_READY');
    s = s.replace(/SERRON_BACKEND_URL/g, 'SERRON_BACKEND_URL');
    s = s.replace(/SERRON_BACKEND_BEARER/g, 'SERRON_BACKEND_BEARER');
    s = s.replace(/SERRON_TALK_BEARER/g, 'SERRON_TALK_BEARER');
    s = s.replace(/SERRON_AGENT_ID_ALIASES/g, 'SERRON_AGENT_ID_ALIASES');
    s = s.replace(/SERRON_USER_PROFILE/g, 'SERRON_USER_PROFILE');
    s = s.replace(/__SERRON_ALERTS_DISPLAY_BOUND__/g, '__SERRON_ALERTS_DISPLAY_BOUND__');
    s = s.replace(/SERRON_URL/g, 'SERRON_URL');
    s = s.replace(/__serron/g, '__serron');
    // Custom events / bus names
    s = s.replace(/(['"`])tendai:/g, '$1serron:');
    // CSS custom properties + modal class prefix
    s = s.replace(/--serron-/g, '--serron-');
    s = s.replace(/serron-modal/g, 'serron-modal');
    s = s.replace(/serron-control-/g, 'serron-control-');
    s = s.replace(/serron-capsule-/g, 'serron-capsule-');
    // Animation / class prefixes that are not storage keys
    s = s.replace(/serronAgentCardEnter/g, 'serronAgentCardEnter');
    s = s.replace(/@keyframes serron/g, '@keyframes serron');
    // File header product name (comments)
    s = s.replace(/\/\/ TendAI —/g, '// Serron —');
    s = s.replace(/\/\* TendAI —/g, '/* Serron —');
    s = s.replace(/# Serron /g, '# Serron ');
    return s;
  });
}

const files = walk(root);
let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before, file);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
    console.log('updated', path.relative(root, file));
  }
}
console.log(`Done. ${changed} files updated.`);
