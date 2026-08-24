#!/usr/bin/env node
/**
 * Generate solid-color placeholder JPGs for weather card assets.
 * Run from repo root: node mobile-app/scripts/generate-weather-placeholders.js
 * Requires: npm install sharp --save-dev
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'weather');
const W = 400;
const H = 300;

const PLACEHOLDERS = [
  { file: 'clear_day.jpg', r: 14, g: 165, b: 233 },      // light blue #0ea5e9
  { file: 'clear_night.jpg', r: 15, g: 23, b: 42 },     // dark blue #0f172a
  { file: 'clear_golden.jpg', r: 245, g: 158, b: 11 }, // orange/amber #f59e0b
  { file: 'overcast_day.jpg', r: 100, g: 116, b: 139 }, // grey #64748b
  { file: 'overcast_night.jpg', r: 30, g: 41, b: 59 }, // dark grey/blue #1e293b
  { file: 'overcast_dawn.jpg', r: 120, g: 113, b: 108 }, // warm grey #78716c
];

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (_) {
    console.error('Missing "sharp". Run: npm install sharp --save-dev');
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  for (const { file, r, g, b } of PLACEHOLDERS) {
    const outPath = path.join(OUT_DIR, file);
    await sharp({
      create: {
        width: W,
        height: H,
        channels: 3,
        background: { r, g, b },
      },
    })
      .jpeg({ quality: 90 })
      .toFile(outPath);
    console.log('Created', outPath);
  }
  console.log('Done. Placeholders in', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
