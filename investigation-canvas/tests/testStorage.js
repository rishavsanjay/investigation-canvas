export const memoryStorage = new Map();
export const sessionMemoryStorage = new Map();

global.localStorage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => memoryStorage.set(key, String(value)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
  get length() { return memoryStorage.size; },
  key: (i) => [...memoryStorage.keys()][i] ?? null
};

global.sessionStorage = {
  getItem: (key) => sessionMemoryStorage.get(key) ?? null,
  setItem: (key, value) => sessionMemoryStorage.set(key, String(value)),
  removeItem: (key) => sessionMemoryStorage.delete(key),
  clear: () => sessionMemoryStorage.clear(),
  get length() { return sessionMemoryStorage.size; },
  key: (i) => [...sessionMemoryStorage.keys()][i] ?? null
};
