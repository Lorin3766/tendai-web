/**
 * Task 15b-1: run the 8 red tests alone, twice, on a given checkout.
 * Usage: node scripts/_bisect-15b.mjs --label v11e-16 --out results.json
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'current';
const outPath = args.includes('--out')
  ? path.resolve(args[args.indexOf('--out') + 1])
  : path.join(root, `scripts/_bisect-${label}.json`);

const TESTS = [
  'verify-talk-part3.mjs',
  'verify-talk-part4.mjs',
  'verify-talk-part5.mjs',
  'verify-onboarding-sync-fixes.mjs',
  'verify-task4-privacy.mjs',
  'verify-task5c-consent.mjs',
  'verify-task6b-feed-toggle.mjs',
  'verify-task14c-1.mjs',
];

function runOnce(script) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(root, 'scripts', script)], {
      cwd: root,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', (code) => {
      const text = out.trim();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const firstFail =
        lines.find((l) =>
          /FAIL:|AssertionError|TimeoutError|Cannot find package|ERR_MODULE_NOT_FOUND|name: 'TimeoutError'|name: 'Error'/.test(
            l
          )
        ) ||
        lines.find((l) => /^Error\b/.test(l)) ||
        (code === 0 ? '' : lines[lines.length - 1] || `exit ${code}`);
      let kind = 'pass';
      if (code !== 0) {
        if (/TimeoutError|Timeout \d+ms exceeded|waiting for/i.test(text)) kind = 'timeout';
        else if (/relay|Gemini|GOOGLE_API_KEY|live/i.test(text)) kind = 'live_dep';
        else kind = 'assertion';
      }
      resolve({
        script,
        code,
        ms: Date.now() - started,
        kind: code === 0 ? 'pass' : kind,
        firstError: firstFail.slice(0, 240),
        tail: lines.slice(-8).join('\n').slice(0, 600),
      });
    });
  });
}

const results = { label, root, startedAt: new Date().toISOString(), runs: [] };
for (const script of TESTS) {
  const a = await runOnce(script);
  const b = await runOnce(script);
  results.runs.push({ script, run1: a, run2: b });
  console.log(
    JSON.stringify({
      script,
      r1: { code: a.code, kind: a.kind, ms: a.ms, err: a.firstError },
      r2: { code: b.code, kind: b.kind, ms: b.ms, err: b.firstError },
    })
  );
}
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log('WROTE', outPath);
