// Serron — Send Log to Dev (dogfooding feedback)
// @owner: settings
// @role: utils
// Builds a short log (version, platform, health status) and opens mailto or copies to clipboard.

const DEV_EMAIL = 'dev@tendai.app';
const SUBJECT = 'TendAI Log Report (Dogfooding)';

function buildLogBody() {
  const lines = [];
  lines.push('--- TendAI Log Report ---');
  lines.push('Date: ' + new Date().toISOString());
  lines.push('Version: v1.0.0 (PWA)');
  const Cap = typeof window !== 'undefined' && window.Capacitor;
  lines.push('Platform: ' + (Cap ? (Cap.getPlatform?.() || 'native') : 'web'));
  if (typeof navigator !== 'undefined') {
    lines.push('UserAgent: ' + (navigator.userAgent || '').substring(0, 80));
  }
  if (window.HealthSync) {
    const has = window.HealthSync.hasHardwareData?.() ? 'yes' : 'no';
    lines.push('HealthSync data: ' + has);
  }
  lines.push('');
  lines.push('--- Your message (bug report or UX thoughts) ---');
  lines.push('');
  return lines.join('\r\n');
}

/**
 * Copy log to clipboard and show toast, or open mailto with pre-filled body.
 */
function sendLogToDev() {
  const body = buildLogBody();
  const mailto = 'mailto:' + DEV_EMAIL + '?subject=' + encodeURIComponent(SUBJECT) + '&body=' + encodeURIComponent(body);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(body).then(() => {
      showToast('Log copied. Paste in your email to send to dev.');
      window.open(mailto, '_blank');
    }).catch(() => {
      window.location.href = mailto;
    });
  } else {
    window.location.href = mailto;
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'talk-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('talk-toast-visible'));
  setTimeout(() => {
    toast.classList.remove('talk-toast-visible');
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

window.sendLogToDev = sendLogToDev;
