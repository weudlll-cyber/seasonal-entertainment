// ============================================================
// File:        memoryIndexedDb.js
// Path:        client/src/test/memoryIndexedDb.js
// Project:     Seasonal Entertainment
// Description: Test stand-in for the browser's IndexedDB (jsdom has none), just what
//              keys/deviceKey.js uses: open() with its upgrade step, one object store per
//              database, put/get/delete by key, close(). Answers arrive asynchronously, as in a
//              browser. fail: 'open' refuses opening the database (a blocked private window),
//              'request' lets every store request fail. stores() shows what is kept.
// ============================================================

// A request: on a later turn either act() runs and gives the result, or (fail) it errors and
// nothing changes.
function settle(fail, act) {
  const request = {};
  setTimeout(() => {
    if (fail) {
      request.error = new DOMException('blocked', 'UnknownError');
      request.onerror?.();
    } else {
      request.result = act();
      request.onsuccess?.();
    }
  });
  return request;
}

export function memoryIndexedDb({ fail = null } = {}) {
  const databases = new Map(); // name -> Map(store name -> Map(key -> value))
  const failRequests = fail === 'request';

  const connection = (stores) => ({
    createObjectStore: (name) => stores.set(name, new Map()),
    transaction: (name) => ({
      objectStore: () => {
        const store = stores.get(name);
        return {
          put: (value, key) => settle(failRequests, () => store.set(key, value) && key),
          get: (key) => settle(failRequests, () => store.get(key)),
          delete: (key) => settle(failRequests, () => void store.delete(key)),
        };
      },
    }),
    close: () => {},
  });

  return {
    open(name) {
      const request = {};
      setTimeout(() => {
        if (fail === 'open') {
          request.error = new DOMException('blocked', 'SecurityError');
          request.onerror?.();
          return;
        }
        const isNew = !databases.has(name);
        if (isNew) databases.set(name, new Map());
        request.result = connection(databases.get(name));
        if (isNew) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
    stores: (name) => databases.get(name),
  };
}
