/**
 * Task 14a — Focus Area colors + glyphs (identity only; never good/bad).
 * @owner: human-os
 */

/** Warm graphite card surface used for contrast checks. */
export const AREA_SURFACE = '#1c1a17';

/**
 * Bright area colors on warm graphite. Distinct from gold (#f6c36a).
 * Ratios vs AREA_SURFACE computed in verify-task14.
 */
export const FOCUS_AREA_COLORS = {
  sleep: { hex: '#8B9CFF', label: 'indigo' },
  move: { hex: '#4FD68A', label: 'green' },
  nutrition: { hex: '#FF9F4A', label: 'orange' },
  labs: { hex: '#2FD6C6', label: 'teal' },
  stress: { hex: '#5CB8FF', label: 'sky' },
  longevity: { hex: '#B8E04A', label: 'lime' },
  skin: { hex: '#FF7AB8', label: 'pink' },
  cardio: { hex: '#FF6B6B', label: 'coral' },
  mental: { hex: '#C084FC', label: 'purple' },
};

const SVG = {
  sleep: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  move: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="15" cy="7" r="2" fill="currentColor"/><path fill="currentColor" d="M9 19l1.5-4.5-2-1.5-2 2-1.5-1.5 3-2.5c.7-.5 1.7-.5 2.4 0l1.6 1 1.8-1.2 1 1.5-2.2 1.5c-.6.4-1.4.4-2 0l-.2-.2L9.5 19H9zm7-.5-2-3 1-1 2 3-1 1z"/></svg>',
  nutrition: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M17 8C8 10 6 20 6 20s4-2 8-4c0-3 1-6 3-8zm-1-5c2 0 4 2 4 4 0 1.5-.6 2.9-1.6 4C14 6 10 6 7 8c2-4 6-5 9-5z"/></svg>',
  labs: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M9 3h6v1h-1.2L18 15a3 3 0 0 1-6 0l-1.8-11H10V3H9zm3 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM6 20h12v2H6v-2z"/></svg>',
  stress: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M12 4C9.5 4 7.5 6 7.5 8.5c0 1.1.4 2.1 1.2 2.9-.5.6-.8 1.3-.8 2.1 0 1.66 1.34 3 3 3h.2c.5 1.38 1.8 2.4 3.2 2.4s2.7-1.02 3.2-2.4h.2c1.66 0 3-1.34 3-3 0-.8-.3-1.5-.8-2.1.8-.8 1.2-1.8 1.2-2.9 0-2.5-2-4.5-4.5-4.5zm0 2c1.38 0 2.5 1.12 2.5 2.5 0 .9-.4 1.7-1 2.2V16h-3v-5.3c-.6-.5-1-1.3-1-2.2C9.5 7.12 10.62 6 12 6z"/></svg>',
  // Longevity: hourglass (replaces lung / bar-chart)
  longevity: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M6 2h12v2h-1l-4 5.5L17 15h1v2H6v-2h1l4-5.5L7 4H6V2zm6 8.2L9.2 15h5.6L12 10.2zM9.2 4l1.6 2.2h2.4L14.8 4H9.2z"/></svg>',
  skin: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M12 5c-4.4 0-8 3.1-9.2 7.2C4 16.9 7.6 20 12 20s8-3.1 9.2-7.8C20 8.1 16.4 5 12 5zm0 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>',
  cardio: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M12 21.1l-1.2-1.1C6.1 15.9 3 13.1 3 9.6A4.6 4.6 0 0 1 7.6 5c1.7 0 3.3.8 4.4 2.1A5.7 5.7 0 0 1 16.4 5 4.6 4.6 0 0 1 21 9.6c0 3.5-3.1 6.3-7.8 10.4L12 21.1z"/></svg>',
  // Mental: speech / mind distinct from stress brain
  mental: '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path fill="currentColor" d="M4 4h12a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-5l-4 4v-4H4a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4zm3 5v2h8V9H7zm0 3v2h5v-2H7z"/></svg>',
};

/**
 * @param {string} areaId
 * @returns {{ id: string, hex: string, label: string, glyphSvg: string }}
 */
export function getFocusAreaVisual(areaId) {
  const id = String(areaId || '').trim().toLowerCase();
  const color = FOCUS_AREA_COLORS[id] || { hex: '#C9C2B8', label: 'neutral' };
  const glyphSvg = SVG[id] || SVG.sleep;
  return { id, hex: color.hex, label: color.label, glyphSvg };
}

/** sRGB channel → linear. */
function lin(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance for #RRGGBB. */
export function relativeLuminance(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return 0;
  const r = lin(parseInt(h.slice(0, 2), 16));
  const g = lin(parseInt(h.slice(2, 4), 16));
  const b = lin(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(hexA, hexB) {
  const L1 = relativeLuminance(hexA);
  const L2 = relativeLuminance(hexB);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Markup for the colored glyph circle used on cards and pickers.
 * @param {string} areaId
 * @param {string} [extraClass]
 */
export function focusAreaGlyphHtml(areaId, extraClass = '') {
  const v = getFocusAreaVisual(areaId);
  const cls = ['focus-area-glyph', extraClass].filter(Boolean).join(' ');
  return `<span class="${cls}" data-focus-area-glyph="${v.id}" style="--area-color:${v.hex}" aria-hidden="true"><span class="focus-area-glyph__mark">${v.glyphSvg}</span></span>`;
}
