import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRecords, fetchPublicApiText, parseDataText, parseJsonLines, validatePublicApiUrl } from '../src/dataSources.js';
import { loadPublicApiSource } from '../src/dataClient.js';

test('nested JSON record paths normalize into a dataset', () => {
  const out = parseDataText('{"payload":{"events":[{"x":1},{"x":2}]}}', { filename:'events.json', recordsPath:'payload.events' });
  assert.equal(out.type, 'dataset');
  assert.equal(out.dataset.records.length, 2);
  assert.equal(out.dataset.provenance.kind, 'file');
});

test('common API response envelopes are detected', () => {
  assert.deepEqual(extractRecords({ results:[{id:1}] }), [{id:1}]);
  assert.deepEqual(extractRecords({ data:[{id:2}] }), [{id:2}]);
});

test('JSONL parsing reports useful line errors', () => {
  assert.equal(parseJsonLines('{"x":1}\n{"x":2}\n').length, 2);
  assert.throws(() => parseJsonLines('{"x":1}\nnope'), /line 2/);
});

test('workspace exports are distinguished from datasets', () => {
  const payload = { format:'investigation-canvas/v1', dataset:{}, workspace:{} };
  assert.equal(parseDataText(JSON.stringify(payload), { filename:'workspace.json' }).type, 'workspace');
});

test('public API URLs require credential-free HTTPS', () => {
  assert.equal(validatePublicApiUrl('https://example.com/data'), 'https://example.com/data');
  assert.throws(() => validatePublicApiUrl('http://example.com/data'), /HTTPS/);
  assert.throws(() => validatePublicApiUrl('https://user:secret@example.com/data'), /credentials/);
});

test('public API loader uses GET without credentials', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok:true, status:200, headers:{ get:(name)=>name==='content-type'?'application/json':null }, text:async()=>'{"results":[{"x":1}]}' };
  };
  const result = await fetchPublicApiText('https://example.com/data', { fetchImpl });
  assert.match(result.text, /results/);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(result.contentType, 'application/json');
});

test('public API snapshots honor CSV response types', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok:true, status:200, headers:{ get:(name)=>name==='content-type'?'text/csv':null }, text:async()=>'region,value\nEU,4\nUS,7\n' });
  try {
    const result = await loadPublicApiSource({ url:'https://example.com/events', title:'Live events' });
    assert.equal(result.dataset.records.length, 2);
    assert.equal(result.dataset.title, 'Live events');
    assert.equal(result.dataset.provenance.kind, 'api');
  } finally { globalThis.fetch = originalFetch; }
});
