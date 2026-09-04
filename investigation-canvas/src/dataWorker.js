import { parseDataText } from './dataSources.js';

self.addEventListener('message', (event) => {
  const { id, text, options } = event.data || {};
  try {
    self.postMessage({ id, result: parseDataText(text, options) });
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
});
