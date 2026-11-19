/**
 * Fast tier — Feed/Talk layout + render checks. Target under ~3 minutes.
 * Uses OBRIUM_URL or default http://127.0.0.1:5501 (npm run serve).
 *
 * Usage: npm run test:quick
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SCRIPTS = [
  'verify-task14b.mjs',
  'verify-task14d-1.mjs',
  'verify-task14c-render.mjs',
];

console.log(`[test:quick] base ${baseUrl}`);
const started = Date.now();
let failed = 0;

for (const file of SCRIPTS) {
  process.stdout.write(`… ${file}\n`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('close', resolve);
  });
  if (code !== 0) {
    failed += 1;
    console.error(`FAIL ${file} (exit ${code})`);
  } else {
    console.log(`PASS ${file}`);
  }
}

const ms = Date.now() - started;
console.log(`\n========== test:quick ==========`);
console.log(`${SCRIPTS.length - failed}/${SCRIPTS.length} passed in ${ms}ms`);
if (failed) process.exit(1);
console.log('OK test:quick');
