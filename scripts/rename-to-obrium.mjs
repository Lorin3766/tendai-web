/**
 * One-off: replace user-facing "Seregin OS" with "Obrium" in an explicit file list.
 * Skips comment lines / trailing comments; never touches keys, ids, events or identifiers.
 * Usage: node scripts/rename-to-obrium.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'mobile-app/components/talk.js',
  'mobile-app/index.html',
  'mobile-app/disclaimer.html',
  'mobile-app/privacy-policy.html',
  'mobile-app/terms-of-use.html',
  'mobile-app/manifest.json',
  'mobile-app/js/ai-feed-advice.js',
  'mobile-app/js/calendar/events.js',
  'mobile-app/js/calendar/ui.js',
  'mobile-app/js/core/backend-fetch.js',
  'mobile-app/js/features/calendar/events.js',
  'mobile-app/js/features/calendar/ui.js',
  'mobile-app/js/features/feed/ai-feed-advice.js',
  'mobile-app/js/features/feed/feed-content-slot.js',
  'mobile-app/js/features/human-os/ultimate-agent-creator-modal.js',
  'mobile-app/js/features/profile/profile-modals.js',
  'mobile-app/js/features/profile/profile-schema.js',
  'mobile-app/js/features/settings/send-log-to-dev.js',
  'mobile-app/js/features/settings/system-onboarding.js',
  'mobile-app/js/features/settings/welcome-modal.js',
  'mobile-app/js/features/talk/llm.js',
  'tendai-backend/package.json',
  'tendai-backend/routes/feed-advice.js',
  'tendai-backend/services/talkSystemPrompt.js',
];

function isCommentLine(t) {
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--');
}

let total = 0;
for (const rel of FILES) {
  const file = path.join(root, rel);
  const src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let count = 0;
  const out = src.split(/\r?\n/).map((line) => {
    if (isCommentLine(line.trim())) return line;
    return line.replace(/Seregin OS|SEREGIN OS/g, (m, idx) => {
      const before = line.slice(0, idx);
      if (/(^|[^:'"`])\/\/[^'"`]*$/.test(before)) return m;
      if (/<!--(?![\s\S]*-->)/.test(before)) return m;
      count++;
      return m === 'SEREGIN OS' ? 'OBRIUM' : 'Obrium';
    });
  }).join(eol);
  if (count) fs.writeFileSync(file, out, 'utf8');
  console.log(`${String(count).padStart(3)}  ${rel}`);
  total += count;
}
console.log(`TOTAL ${total}`);
