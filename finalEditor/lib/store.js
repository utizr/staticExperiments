/**
 * Store — persistence layer for the app data.
 *
 * Abstracts *where* the data lives behind a tiny async interface so the app
 * never talks to localStorage (or a server) directly:
 *
 *   const store = Store.createStore({ backend: 'local', storageKey: 'my_key' });
 *   const data = await store.load();   // object, or null if nothing saved yet
 *   await store.save(data);
 *
 * Backends:
 *   - 'local' — localStorage. Synchronous under the hood, but exposed as
 *     async so callers don't care which backend is active.
 *   - 'api'   — a server REST API (GET/PUT baseUrl). Currently a MOCK that
 *     simulates request latency and persists to a separate localStorage key
 *     so it behaves realistically across reloads. Swap the marked section
 *     for real fetch() calls when the server exists.
 */
const Store = (() => {

  // ════════════════════════════════════════════
  //  localStorage backend
  // ════════════════════════════════════════════

  function createLocalBackend({ storageKey }) {
    if (!storageKey) throw new Error('Store: local backend requires a storageKey');

    return {
      async load() {
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      },

      async save(data) {
        localStorage.setItem(storageKey, JSON.stringify(data));
      },
    };
  }

  // ════════════════════════════════════════════
  //  Server API backend (MOCK)
  // ════════════════════════════════════════════
  //
  // Interface of the future real API:
  //   GET  {baseUrl}/data  → 200 with JSON body, or 404 if nothing saved
  //   PUT  {baseUrl}/data  → JSON body is the full app data
  //
  // The mock keeps the same async contract (including latency) but stores
  // the payload in localStorage under its own key, so the app keeps working
  // across reloads while developing against it.

  function createApiBackend({ baseUrl = '/api', latencyMs = 150 } = {}) {
    const MOCK_STORAGE_KEY = 'textEditor_mock_api_data';
    const delay = () => new Promise(resolve => setTimeout(resolve, latencyMs));

    return {
      async load() {
        // Real implementation (once the server exists):
        //   const res = await fetch(`${baseUrl}/data`);
        //   if (res.status === 404) return null;
        //   if (!res.ok) throw new Error(`Store: load failed (${res.status})`);
        //   return res.json();
        await delay();
        console.info(`[Store mock] GET ${baseUrl}/data`);
        const raw = localStorage.getItem(MOCK_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      },

      async save(data) {
        // Real implementation (once the server exists):
        //   const res = await fetch(`${baseUrl}/data`, {
        //     method: 'PUT',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(data),
        //   });
        //   if (!res.ok) throw new Error(`Store: save failed (${res.status})`);
        await delay();
        console.info(`[Store mock] PUT ${baseUrl}/data`);
        localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(data));
      },
    };
  }

  // ════════════════════════════════════════════
  //  Factory
  // ════════════════════════════════════════════

  /**
   * @param {Object} options
   * @param {'local'|'api'} [options.backend='local'] - Which backend to use.
   * @param {string} [options.storageKey]  - localStorage key ('local' backend).
   * @param {string} [options.baseUrl]     - API root ('api' backend).
   * @param {number} [options.latencyMs]   - Simulated latency ('api' mock).
   * @returns {{ load: () => Promise<Object|null>, save: (data: Object) => Promise<void> }}
   */
  function createStore(options = {}) {
    const { backend = 'local', ...backendOptions } = options;

    switch (backend) {
      case 'local': return createLocalBackend(backendOptions);
      case 'api': return createApiBackend(backendOptions);
      default: throw new Error(`Store: unknown backend "${backend}"`);
    }
  }

  return { createStore };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Store;
}
