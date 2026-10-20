// Global test environment setup for Vitest
// Provides required Chrome Extension mock objects for webextension-polyfill

if (!globalThis.chrome) {
  globalThis.chrome = {
    runtime: {
      id: "theboringenglish-test-id",
      sendMessage: () => Promise.resolve(),
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
        hasListener: () => false,
      },
    },
    tabs: {
      query: () => Promise.resolve([]),
      sendMessage: () => Promise.resolve(),
    },
    storage: {
      local: {
        get: (keys, cb) => (cb ? cb({}) : Promise.resolve({})),
        set: (items, cb) => (cb ? cb() : Promise.resolve()),
        remove: (keys, cb) => (cb ? cb() : Promise.resolve()),
        clear: (cb) => (cb ? cb() : Promise.resolve()),
      },
      onChanged: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
  };
}
