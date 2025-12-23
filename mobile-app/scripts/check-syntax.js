#!/usr/bin/env node
// Pre-commit syntax checker for TendAI
// Checks JS files for syntax errors before commit

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const JS_FILES = [
  'mobile-app/app-unified.js',
  'mobile-app/js/calendar-init.js'
];

const HTML_FILES = [
  'mobile-app/index.html'
];

let hasErrors = false;

console.log('[SYNTAX CHECK] Starting pre-commit validation...\n');

// Check JS files
JS_FILES.forEach(file => {
  const filePath = path.join(__dirname, '..', '..', file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] ${file} (not found)`);
    return;
  }

  try {
    // For JS files, use node --check
    execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
    console.log(`[OK] ${file}`);
  } catch (error) {
    const errorMsg = error.stderr ? error.stderr.toString() : error.message;
    console.error(`[ERROR] ${file}`);
    console.error(`  ${errorMsg.split('\n').filter(l => l.trim()).join('\n  ')}`);
    hasErrors = true;
  }
});

// Check HTML files for script tag syntax
HTML_FILES.forEach(file => {
  const filePath = path.join(__dirname, '..', '..', file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] ${file} (not found)`);
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for unclosed script tags
    const openScripts = (content.match(/<script[^>]*>/g) || []).length;
    const closeScripts = (content.match(/<\/script>/g) || []).length;
    
    if (openScripts !== closeScripts) {
      console.error(`[ERROR] ${file}: Unclosed script tags (${openScripts} open, ${closeScripts} closed)`);
      hasErrors = true;
      return;
    }
    
    // Check external script src attributes
    const scriptSrcMatches = content.match(/<script[^>]*src=["']([^"']+)["'][^>]*>/g) || [];
    scriptSrcMatches.forEach(scriptTag => {
      const srcMatch = scriptTag.match(/src=["']([^"']+)["']/);
      if (srcMatch) {
        const scriptPath = path.join(path.dirname(filePath), srcMatch[1]);
        if (!fs.existsSync(scriptPath)) {
          console.error(`[ERROR] ${file}: Script file not found: ${srcMatch[1]}`);
          hasErrors = true;
        }
      }
    });
    
    console.log(`[OK] ${file}`);
  } catch (error) {
    console.error(`[ERROR] ${file}: ${error.message}`);
    hasErrors = true;
  }
});

console.log('');

if (hasErrors) {
  console.error('[SYNTAX CHECK] ❌ FAILED - Fix syntax errors before committing');
  process.exit(1);
} else {
  console.log('[SYNTAX CHECK] ✅ PASSED - All files are syntactically correct');
  process.exit(0);
}

