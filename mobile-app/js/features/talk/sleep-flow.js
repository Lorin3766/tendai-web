// Serron — Sleep check-in flow (removed; stubs kept for import compatibility)
// @owner: talk
// @role: legacy-stub

export function getLocalDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getPendingSleepCheckinForDate() {
  return null;
}

export function maybeCreateSleepCheckinOnBoot() {}

export function initSleepFlow() {}

export function renderPendingSleepFlow() {}
