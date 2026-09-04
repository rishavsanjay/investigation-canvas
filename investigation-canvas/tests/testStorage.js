export const memoryStorage = new Map();

global.localStorage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => memoryStorage.set(key, String(value)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
  get length() { return memoryStorage.size; },
  key: (i) => [...memoryStorage.keys()][i] ?? null
};
