import { inferDataset, parseCsv } from './core.js';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_RECORDS = 50_000;

const SOURCE_KEYS = ['records', 'data', 'items', 'results', 'rows'];

function titleFromName(name = 'Imported investigation') {
  return String(name).replace(/\.(csv|json|jsonl|ndjson)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported investigation';
}

function valueAtPath(value, path = '') {
  if (!path.trim()) return value;
  return path.split('.').filter(Boolean).reduce((current, part) => {
    if (current == null || !(part in Object(current))) throw new Error(`Records path not found: ${path}`);
    return current[part];
  }, value);
}

export function extractRecords(payload, recordsPath = '') {
  const selected = valueAtPath(payload, recordsPath);
  if (Array.isArray(selected)) return selected;
  if (!selected || typeof selected !== 'object') throw new Error('The selected JSON value is not a record array');
  for (const key of SOURCE_KEYS) if (Array.isArray(selected[key])) return selected[key];
  throw new Error(`No record array found. Expected an array or one of: ${SOURCE_KEYS.join(', ')}`);
}

export function parseJsonLines(text) {
  const records = [];
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); }
    catch (error) { throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`JSONL line ${index + 1} is not an object`);
    records.push(value);
  }
  return records;
}

function validateRecords(records) {
  if (!Array.isArray(records) || !records.length) throw new Error('No records found');
  if (records.length > MAX_IMPORT_RECORDS) throw new Error(`Import has ${records.length.toLocaleString()} records; the browser limit is ${MAX_IMPORT_RECORDS.toLocaleString()}`);
  if (records.some((record) => !record || typeof record !== 'object' || Array.isArray(record))) throw new Error('Every record must be a JSON object');
  return records;
}

export function parseDataText(text, options = {}) {
  const filename = String(options.filename || 'import.json');
  if (new TextEncoder().encode(String(text)).byteLength > MAX_IMPORT_BYTES) throw new Error(`Import exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MB browser limit`);
  const extension = filename.toLowerCase().split('.').pop();
  let records;
  if (extension === 'csv') records = parseCsv(String(text));
  else if (extension === 'jsonl' || extension === 'ndjson') records = parseJsonLines(text);
  else {
    let payload;
    try { payload = JSON.parse(String(text)); }
    catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
    if (payload?.format === 'investigation-canvas/v1') return { type: 'workspace', payload };
    records = extractRecords(payload, options.recordsPath || '');
  }
  validateRecords(records);
  const title = options.title?.trim() || titleFromName(filename);
  const dataset = inferDataset(records, title);
  dataset.provenance = {
    kind: options.sourceKind || 'file',
    label: options.sourceLabel || filename,
    description: options.sourceDescription || `${records.length.toLocaleString()} records imported from ${filename}`,
    sourceUrl: options.sourceUrl || null,
    importedAt: new Date().toISOString()
  };
  return { type: 'dataset', dataset };
}

export function validatePublicApiUrl(input) {
  let url;
  try { url = new URL(input); }
  catch { throw new Error('Enter a valid public API URL'); }
  if (url.protocol !== 'https:') throw new Error('Public API sources must use HTTPS');
  if (url.username || url.password) throw new Error('API credentials are not accepted in URLs');
  return url.href;
}

export async function fetchPublicApiText(input, { timeoutMs = 12_000, fetchImpl = fetch } = {}) {
  const url = validatePublicApiUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
    const contentLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_BYTES) throw new Error(`API response exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MB browser limit`);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error(`API response exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MB browser limit`);
    return { url, text, contentType: response.headers?.get?.('content-type') || '' };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`API request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
