// Serron — IndexedDB storage for daily biometrics
// Payload shape:
// {
//   date: "YYYY-MM-DD",
//   metrics: { steps: Number, sleep: Number }
// }

const DB_NAME = 'tendai_local_db';
const DB_VERSION = 1;
const STORE_NAME = 'biometrics';
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

let dbPromise = null;

function createDbError(message, cause) {
  const error = new Error(message);
  if (cause) error.cause = cause;
  return error;
}

function isIndexedDbSupported() {
  return typeof indexedDB !== 'undefined';
}

function validateDate(date) {
  if (typeof date !== 'string' || !DATE_REGEX.test(date)) {
    throw createDbError(`Invalid date "${date}". Expected format: YYYY-MM-DD.`);
  }
}

function validateMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    throw createDbError('Invalid metrics payload. "metrics" must be an object.');
  }

  const { steps, sleep } = metrics;
  if (typeof steps !== 'number' || Number.isNaN(steps)) {
    throw createDbError('Invalid metrics.steps. Expected a Number.');
  }
  if (typeof sleep !== 'number' || Number.isNaN(sleep)) {
    throw createDbError('Invalid metrics.sleep. Expected a Number.');
  }
}

function validatePayload(data) {
  if (!data || typeof data !== 'object') {
    throw createDbError('Invalid payload. Expected an object.');
  }

  validateDate(data.date);
  validateMetrics(data.metrics);
}

function getDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(createDbError('IndexedDB is not supported in this environment.'));
      return;
    }

    let openRequest;
    try {
      openRequest = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(createDbError('Failed to initialize IndexedDB open request.', error));
      return;
    }

    openRequest.onupgradeneeded = (event) => {
      try {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'date' });
        }
      } catch (error) {
        reject(createDbError('IndexedDB version upgrade failed.', error));
      }
    };

    openRequest.onsuccess = () => {
      const db = openRequest.result;

      db.onversionchange = () => {
        // Close stale connections so a future upgrade can proceed cleanly.
        db.close();
        dbPromise = null;
      };

      resolve(db);
    };

    openRequest.onerror = () => {
      reject(
        createDbError(
          'IndexedDB open request failed.',
          openRequest.error || new Error('Unknown open request error.')
        )
      );
    };

    openRequest.onblocked = () => {
      reject(
        createDbError(
          'IndexedDB open request blocked. Close other tabs/windows using this app and retry.'
        )
      );
    };
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

/**
 * Delete the whole biometrics database (used by "Delete all local data").
 * @returns {Promise<boolean>} false if IndexedDB is unavailable or the delete was blocked/failed.
 */
export async function deleteBiometricsDatabase() {
  if (!isIndexedDbSupported()) return false;
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch (_) {}
    dbPromise = null;
  }
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.deleteDatabase(DB_NAME);
    } catch (_) {
      resolve(false);
      return;
    }
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
}

/**
 * Save or replace biometrics metrics by date.
 * @param {{ date: string, metrics: { steps: number, sleep: number } }} data
 * @returns {Promise<{ date: string, metrics: { steps: number, sleep: number } }>}
 */
export async function saveMetrics(data) {
  validatePayload(data);
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, 'readwrite');
    } catch (error) {
      reject(createDbError('Failed to start write transaction.', error));
      return;
    }

    let store;
    try {
      store = transaction.objectStore(STORE_NAME);
    } catch (error) {
      reject(createDbError(`Object store "${STORE_NAME}" is unavailable.`, error));
      return;
    }

    const request = store.put({
      date: data.date,
      metrics: {
        steps: data.metrics.steps,
        sleep: data.metrics.sleep
      }
    });

    request.onsuccess = () => {
      resolve({
        date: data.date,
        metrics: {
          steps: data.metrics.steps,
          sleep: data.metrics.sleep
        }
      });
    };

    request.onerror = () => {
      reject(
        createDbError(
          'Failed to save metrics record.',
          request.error || new Error('Unknown put request error.')
        )
      );
    };

    transaction.onerror = () => {
      reject(
        createDbError(
          'Write transaction failed.',
          transaction.error || new Error('Unknown transaction error.')
        )
      );
    };

    transaction.onabort = () => {
      reject(
        createDbError(
          'Write transaction was aborted.',
          transaction.error || new Error('Unknown transaction abort reason.')
        )
      );
    };
  });
}

/**
 * Get biometrics metrics by date.
 * @param {string} date - Expected format: YYYY-MM-DD
 * @returns {Promise<{ date: string, metrics: { steps: number, sleep: number } } | null>}
 */
export async function getMetricsByDate(date) {
  validateDate(date);
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(STORE_NAME, 'readonly');
    } catch (error) {
      reject(createDbError('Failed to start read transaction.', error));
      return;
    }

    let store;
    try {
      store = transaction.objectStore(STORE_NAME);
    } catch (error) {
      reject(createDbError(`Object store "${STORE_NAME}" is unavailable.`, error));
      return;
    }

    const request = store.get(date);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(
        createDbError(
          `Failed to fetch metrics for date "${date}".`,
          request.error || new Error('Unknown get request error.')
        )
      );
    };

    transaction.onerror = () => {
      reject(
        createDbError(
          'Read transaction failed.',
          transaction.error || new Error('Unknown transaction error.')
        )
      );
    };

    transaction.onabort = () => {
      reject(
        createDbError(
          'Read transaction was aborted.',
          transaction.error || new Error('Unknown transaction abort reason.')
        )
      );
    };
  });
}
