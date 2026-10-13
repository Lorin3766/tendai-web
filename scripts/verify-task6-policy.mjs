/**
 * Task 6a + 6d checkpoint: privacy-policy wording.
 *  6a: ipapi.co disclosed as a separate (non-Google) service, with when it is / isn't called.
 *  6d: free-tier Gemini terms stated; relay retention scoped; "improve our services" removed.
 * Usage: node scripts/verify-task6-policy.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'mobile-app', 'privacy-policy.html'), 'utf8');
const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

let failed = false;
const check = (ok, msg) => {
  if (!ok) {
    console.error('FAIL:', msg);
    failed = true;
  }
};

const sections = {};
for (const m of html.matchAll(/<h3>([^<]+)<\/h3>([\s\S]*?)(?=<h3>|<\/div>\s*<div class="legal-footer">)/g)) {
  sections[m[1].trim()] = m[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// 6a
const loc = sections['Location and Weather Services'] || '';
check(/not part of Google or Gemini/.test(loc), 'location section not separated from Google');
check(/sends your IP address to ipapi\.co/.test(loc), 'ipapi.co IP disclosure missing');
check(/precise location is unavailable/.test(loc) && /not called when you have entered a location or precise location works/.test(loc), 'ipapi.co when/when-not missing');
check(/may then be sent to Gemini/.test(loc), 'ipapi.co -> Gemini flow missing');
check(/ipapi\.co\/privacy/.test(html), 'ipapi.co privacy link missing');
check(!/ipapi/i.test(sections['AI Processing by Google Gemini'] || ''), 'ipapi mentioned inside the Gemini section');

// 6d
check(!/improve our services/.test(text), '"improve our services" still present');
check(!/We do not retain chat history permanently/.test(text), 'unscoped retention claim still present');
check(/relay server does not store your messages or data/.test(sections['Data Storage'] || ''), 'relay retention not scoped');
const ai = sections['AI Processing by Google Gemini'] || '';
check(/free \(unpaid\) tier/.test(ai), 'free tier not stated');
check(/improve and develop Google's products/.test(ai), 'training use not stated');
check(/Human reviewers/.test(ai), 'human review not stated');
check(/ai\.google\.dev\/gemini-api\/terms/.test(html), 'Google terms link missing');
check(!/not used to improve|does not use your (data|prompts)/i.test(text), 'policy denies training use');

console.log('Location and Weather Services:\n ', loc, '\n');
console.log('How We Use Your Information:\n ', sections['How We Use Your Information'], '\n');
console.log('Data Storage:\n ', sections['Data Storage'], '\n');
console.log('Gemini tier paragraph:\n ', (ai.match(/Obrium currently uses[^]*?Privacy & Security\./) || [''])[0]);

if (failed) process.exit(1);
console.log('\nTASK6_POLICY_OK');
