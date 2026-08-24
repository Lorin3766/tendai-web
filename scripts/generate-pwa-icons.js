#!/usr/bin/env node
/**
 * Generate placeholder PWA icons (colored squares) at mobile-app/assets/icons/.
 * Run from repo root: node scripts/generate-pwa-icons.js
 * Uses pngjs (install with: npm install --save-dev pngjs).
 */
const fs = require('fs');
const path = require('path');

let PNG;
try {
  PNG = require('pngjs').PNG;
} catch (e) {
  console.error('Run: npm install --save-dev pngjs');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, '..', 'mobile-app', 'assets', 'icons');
// Slate-800 to slate-900 gradient-ish solid: #1e293b (30, 41, 59)
const R = 30, G = 41, B = 59, A = 255;

function writePng(size) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2;
      png.data[i] = R;
      png.data[i + 1] = G;
      png.data[i + 2] = B;
      png.data[i + 3] = A;
    }
  }
  const outPath = path.join(OUT_DIR, `icon-${size}.png`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return new Promise((resolve, reject) => {
    png.pack()
      .pipe(fs.createWriteStream(outPath))
      .on('finish', () => { console.log('Written', outPath); resolve(); })
      .on('error', reject);
  });
}

(async () => {
  await writePng(192);
  await writePng(512);
})();
