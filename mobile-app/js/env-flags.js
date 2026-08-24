// Centralized environment flags (no app imports to avoid cycles)
export const IS_DEV = ['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:';
export const RUN_MODE = 'unified'; // options: 'unified' | 'modules'

/**
 * Non-essential boot logs ([INIT], [CAL], [BOOT] chatter). Always false when not on a dev host.
 * In dev: enable with localStorage `tendai_verbose_boot=1` or `tendai_debug_logs=1`.
 */
export const IS_VERBOSE_BOOT_LOGS =
  IS_DEV &&
  typeof localStorage !== 'undefined' &&
  (localStorage.getItem('tendai_verbose_boot') === '1' ||
    localStorage.getItem('tendai_debug_logs') === '1');
