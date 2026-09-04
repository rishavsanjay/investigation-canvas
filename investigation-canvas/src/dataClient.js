import { fetchPublicApiText, MAX_IMPORT_BYTES, parseDataText } from './dataSources.js';

function parseInWorker(text, options) {
  if (typeof Worker === 'undefined') return Promise.resolve(parseDataText(text, options));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./dataWorker.js', import.meta.url), { type: 'module' });
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Data parsing timed out')); }, 20_000);
    worker.addEventListener('message', (event) => {
      if (event.data?.id !== id) return;
      clearTimeout(timeout);
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result);
    });
    worker.addEventListener('error', (event) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || 'Data worker failed'));
    }, { once: true });
    worker.postMessage({ id, text, options });
  });
}

export async function loadFileSource(file, options = {}) {
  if (!file) throw new Error('Choose a data file');
  if (file.size > MAX_IMPORT_BYTES) throw new Error(`File exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MB browser limit`);
  const text = await file.text();
  return parseInWorker(text, { ...options, filename: file.name, sourceKind: 'file', sourceLabel: file.name });
}

export async function loadPublicApiSource({ url, recordsPath = '', title = '' }) {
  const response = await fetchPublicApiText(url);
  const pathName = new URL(response.url).pathname.split('/').filter(Boolean).at(-1) || 'api';
  const contentType = response.contentType.toLowerCase();
  const extension = contentType.includes('text/csv') ? 'csv' : contentType.includes('ndjson') ? 'jsonl' : 'json';
  const filename = /\.(csv|json|jsonl|ndjson)$/i.test(pathName) ? pathName : `${pathName}.${extension}`;
  return parseInWorker(response.text, {
    filename,
    recordsPath,
    title,
    sourceKind: 'api',
    sourceLabel: new URL(response.url).hostname,
    sourceDescription: `Public read-only API snapshot from ${response.url}`,
    sourceUrl: response.url
  });
}
