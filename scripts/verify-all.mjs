/**
 * Task 14c-7 — run every verify-*.mjs and print one PASS/FAIL/SKIPPED table.
 * Exit non-zero if any script FAILs.
 *
 * Usage: npm run test:all   (default OBRIUM_URL http://127.0.0.1:5501 via npm run serve)
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** Scripts that need a live relay and/or Gemini key — never mark PASS without them. */
const SKIP = {
  'verify-task5b-feed-advice.mjs': 'needs live relay + GOOGLE_API_KEY',
  'verify-talk-live.mjs': 'needs live relay + Gemini',
  'verify-relay-hardening.mjs': 'needs live relay',
  'verify-talk-final-flow.mjs': 'needs live relay',
  'verify-task11d.mjs': 'lighthouse + optional live deps; run alone',
};

const files = fs
  .readdirSync(__dirname)
  .filter((f) => /^verify-.*\.mjs$/.test(f) && f !== 'verify-all.mjs')
  .sort();

function runOne(file) {
  return new Promise((resolve) => {
    if (SKIP[file]) {
      resolve({ file, status: 'SKIPPED', ms: 0, error: SKIP[file] });
      return;
    }
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, 180000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      if (code === 0) {
        resolve({ file, status: 'PASS', ms, error: '' });
        return;
      }
      const blob = `${err}\n${out}`;
      const line =
        blob
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => /Error|AssertionError|fail|FAIL|ENOENT|TypeError/i.test(l)) ||
        `exit ${code}`;
      resolve({ file, status: 'FAIL', ms, error: line.slice(0, 200) });
    });
  });
}

const rows = [];
for (const file of files) {
  process.stdout.write(`… ${file}\n`);
  // eslint-disable-next-line no-await-in-loop
  const row = await runOne(file);
  rows.push(row);
  console.log(`${row.status.padEnd(7)} ${String(row.ms).padStart(6)}ms  ${file}${row.error ? ' — ' + row.error : ''}`);
}

console.log('\n========== verify-all ==========');
console.log(
  ['script'.padEnd(42), 'status'.padEnd(8), 'ms'.padStart(7), 'note'].join(' '),
);
console.log('-'.repeat(100));
for (const r of rows) {
  console.log(
    [r.file.padEnd(42), r.status.padEnd(8), String(r.ms).padStart(7), r.error || ''].join(' '),
  );
}
const failed = rows.filter((r) => r.status === 'FAIL');
const passed = rows.filter((r) => r.status === 'PASS').length;
const skipped = rows.filter((r) => r.status === 'SKIPPED').length;
console.log(`\n${passed} PASS · ${failed.length} FAIL · ${skipped} SKIPPED`);
if (failed.length) process.exit(1);
console.log('OK verify-all');
