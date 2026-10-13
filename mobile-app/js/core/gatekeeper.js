// Serron — System Shield (boot curtain + optional feed refresh dim)
// @owner: core
// @role: ui

const GK_ID = 'obrium-gatekeeper';

/**
 * Fade out and remove the boot gatekeeper overlay (see index.html #obrium-gatekeeper).
 */
export function releaseObriumGatekeeper() {
  const el = document.getElementById(GK_ID);
  if (!el || el.dataset.released === '1') return;
  el.dataset.released = '1';
  el.classList.add('obrium-gatekeeper--exiting');
  const done = () => {
    try {
      el.remove();
    } catch (_) {}
  };
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 500);
}

/**
 * Manual feed refresh: dim body, run async work, restore with transition.
 * @param {() => void|Promise<void>} fn
 */
export async function withFeedRefreshBodyShield(fn) {
  if (typeof document === 'undefined') return fn();
  const body = document.body;
  if (!body) return fn();
  const prevOpacity = body.style.opacity;
  const prevTransition = body.style.transition;
  body.style.transition = 'opacity 0.2s ease';
  body.style.opacity = '0';
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    await fn();
  } finally {
    requestAnimationFrame(() => {
      body.style.opacity = '1';
      setTimeout(() => {
        body.style.transition = prevTransition || '';
        if (!prevOpacity) body.style.removeProperty('opacity');
        else body.style.opacity = prevOpacity;
      }, 280);
    });
  }
}
