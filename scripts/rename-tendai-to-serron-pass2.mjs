/**
 * Finish TendAI → Serron rename for UPPERCASE TENDAI_* / leftover internals
 * that the first pass over-protected (case-insensitive tendai_ key guard).
 * Still skips lowercase persisted keys: tendai_*, TendAI_MasterRecord, paths.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.md', '.example']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'android', 'ios', '_audit']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (EXT.has(path.extname(ent.name))) out.push(p);
  }
  return out;
}

function transform(src) {
  // Protect lowercase persisted keys + paths only (case-sensitive)
  const held = [];
  let s = src.replace(/tendai_[a-z0-9_]+/g, (m) => {
    const i = held.length;
    held.push(m);
    return `\u0000PROT${i}\u0000`;
  });
  s = s.replace(/TendAI_MasterRecord/g, (m) => {
    const i = held.length;
    held.push(m);
    return `\u0000PROT${i}\u0000`;
  });
  s = s.replace(/tendai-backend/g, (m) => {
    const i = held.length;
    held.push(m);
    return `\u0000PROT${i}\u0000`;
  });
  s = s.replace(/com\.tendai\.app/g, (m) => {
    const i = held.length;
    held.push(m);
    return `\u0000PROT${i}\u0000`;
  });

  s = s.replace(/SERRON_BOOT_READY/g, 'SERRON_BOOT_READY');
  s = s.replace(/SERRON_BACKEND_URL/g, 'SERRON_BACKEND_URL');
  s = s.replace(/SERRON_BACKEND_BEARER/g, 'SERRON_BACKEND_BEARER');
  s = s.replace(/SERRON_TALK_BEARER/g, 'SERRON_TALK_BEARER');
  s = s.replace(/SERRON_AGENT_ID_ALIASES/g, 'SERRON_AGENT_ID_ALIASES');
  s = s.replace(/SERRON_USER_PROFILE/g, 'SERRON_USER_PROFILE');
  s = s.replace(/__SERRON_ALERTS_DISPLAY_BOUND__/g, '__SERRON_ALERTS_DISPLAY_BOUND__');
  s = s.replace(/SERRON_URL/g, 'SERRON_URL');
  s = s.replace(/__serron/g, '__serron');
  s = s.replace(/(['"`])tendai:/g, '$1serron:');
  // Comment leftovers that still say serron:boot-ready without quotes in prose
  s = s.replace(/serron:boot-ready/g, 'serron:boot-ready');
  s = s.replace(/serron:common-ledger-updated/g, 'serron:common-ledger-updated');
  s = s.replace(/serron:agent-sensor-updated/g, 'serron:agent-sensor-updated');
  s = s.replace(/serron:talk-user-submit/g, 'serron:talk-user-submit');
  s = s.replace(/serron:show-advisory/g, 'serron:show-advisory');
  s = s.replace(/serron:server-status/g, 'serron:server-status');
  s = s.replace(/serron:location-changed/g, 'serron:location-changed');
  s = s.replace(/serron:telemetry-ingested/g, 'serron:telemetry-ingested');
  s = s.replace(/serron:shared-context-bus/g, 'serron:shared-context-bus');

  s = s.replace(/\u0000PROT(\d+)\u0000/g, (_, i) => held[Number(i)]);
  return s;
}

let changed = 0;
for (const file of walk(root)) {
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
    console.log('updated', path.relative(root, file));
  }
}
console.log(`Done. ${changed} files updated.`);
