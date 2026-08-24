// Serron — Agent evaluation engine (pure logic, no UI side effects)

const UNKNOWN_RESULT = {
  status: 'UNKNOWN',
  trigger: 'Invalid Data'
};

const CRITICAL_RESULT = {
  status: 'CRITICAL',
  trigger: 'Recovery Deficit: Low Steps or Low Sleep'
};

const OPERATIONAL_RESULT = {
  status: 'OPERATIONAL',
  trigger: null
};

function isValidNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Evaluate daily metrics and classify operational status.
 * Pure function: data-in, data-out only.
 *
 * @param {{ steps: number, sleep: number }} metricsObject
 * @returns {{ status: 'UNKNOWN'|'CRITICAL'|'OPERATIONAL', trigger: string|null }}
 */
export function evaluateDailyMetrics(metricsObject) {
  if (!metricsObject || typeof metricsObject !== 'object') {
    return { ...UNKNOWN_RESULT };
  }

  const { steps, sleep } = metricsObject;
  if (!isValidNumber(steps) || !isValidNumber(sleep)) {
    return { ...UNKNOWN_RESULT };
  }

  if (steps < 5000 || sleep < 6.0) {
    return { ...CRITICAL_RESULT };
  }

  return { ...OPERATIONAL_RESULT };
}
