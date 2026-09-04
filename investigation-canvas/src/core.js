export const deepClone = (value) => JSON.parse(JSON.stringify(value));

export function unique(values) {
  return [...new Set(values)];
}

export function safeNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'object') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return String(value ?? '—');
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(Math.abs(n) < 1 ? 3 : 2);
}

export function extent(records, field, padConstant = true) {
  const nums = records.map((r) => safeNumber(r[field])).filter((v) => v !== null);
  if (!nums.length) return [0, 1];
  let min = nums[0];
  let max = nums[0];
  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i] < min) min = nums[i];
    if (nums[i] > max) max = nums[i];
  }
  if (padConstant && min === max) {
    const pad = Math.abs(min || 1) * 0.1;
    min -= pad;
    max += pad;
  }
  return [min, max];
}

export function mean(records, field) {
  const nums = records.map((r) => safeNumber(r[field])).filter((v) => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function median(records, field) {
  const nums = records.map((r) => safeNumber(r[field])).filter((v) => v !== null).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function stdev(records, field) {
  const nums = records.map((r) => safeNumber(r[field])).filter((v) => v !== null);
  if (nums.length < 2) return 0;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

export function pearson(records, fieldA, fieldB) {
  const pairs = records
    .map((r) => [safeNumber(r[fieldA]), safeNumber(r[fieldB])])
    .filter(([a, b]) => a !== null && b !== null);
  if (pairs.length < 3) return 0;
  const ma = pairs.reduce((s, [a]) => s + a, 0) / pairs.length;
  const mb = pairs.reduce((s, [, b]) => s + b, 0) / pairs.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (const [a, b] of pairs) {
    num += (a - ma) * (b - mb);
    da += (a - ma) ** 2;
    db += (b - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function normalizeFilter(filter) {
  if (!filter || !filter.field) return null;
  return {
    field: filter.field,
    op: filter.op || 'eq',
    value: filter.value,
    min: filter.min,
    max: filter.max
  };
}

export function recordMatchesFilter(record, rawFilter) {
  const filter = normalizeFilter(rawFilter);
  if (!filter) return false;
  const value = record[filter.field];
  const lower = String(value ?? '').toLowerCase();
  const target = String(filter.value ?? '').toLowerCase();
  switch (filter.op) {
    case 'eq': return String(value ?? '') === String(filter.value ?? '');
    case 'neq': return String(value ?? '') !== String(filter.value ?? '');
    case 'contains': return lower.includes(target);
    case 'gt': {
      const n = safeNumber(value);
      const targetNum = safeNumber(filter.value);
      return n !== null && targetNum !== null && n > targetNum;
    }
    case 'gte': {
      const n = safeNumber(value);
      const targetNum = safeNumber(filter.value);
      return n !== null && targetNum !== null && n >= targetNum;
    }
    case 'lt': {
      const n = safeNumber(value);
      const targetNum = safeNumber(filter.value);
      return n !== null && targetNum !== null && n < targetNum;
    }
    case 'lte': {
      const n = safeNumber(value);
      const targetNum = safeNumber(filter.value);
      return n !== null && targetNum !== null && n <= targetNum;
    }
    case 'between': {
      const n = safeNumber(value);
      const minNum = safeNumber(filter.min);
      const maxNum = safeNumber(filter.max);
      return n !== null && minNum !== null && maxNum !== null && n >= minNum && n <= maxNum;
    }
    case 'in': {
      const values = Array.isArray(filter.value) ? filter.value.map(String) : String(filter.value ?? '').split(',').map((x) => x.trim());
      return values.includes(String(value ?? ''));
    }
    default: return false;
  }
}

export function filterRecords(records, filters = [], search = '') {
  if (!Array.isArray(records) || !Array.isArray(filters)) return [];
  const q = String(search || '').trim().toLowerCase();
  return records.filter((record) => {
    if (!filters.every((f) => recordMatchesFilter(record, f))) return false;
    if (!q) return true;
    return Object.values(record).some((value) => String(value ?? '').toLowerCase().includes(q));
  });
}

export function groupCounts(records, field) {
  const map = new Map();
  for (const record of records) {
    const key = String(record[field] ?? '∅');
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

export function summarizeRecords(records, numericFields = []) {
  const summary = { count: records.length, metrics: {} };
  for (const field of numericFields) {
    summary.metrics[field] = {
      mean: mean(records, field),
      median: median(records, field),
      min: extent(records, field, false)[0],
      max: extent(records, field, false)[1],
      stdev: stdev(records, field)
    };
  }
  return summary;
}

export function compareGroups(groupA, groupB, numericFields = [], categoricalFields = []) {
  const numeric = numericFields.map((field) => {
    const a = mean(groupA, field);
    const b = mean(groupB, field);
    const pooled = Math.sqrt(((stdev(groupA, field) ** 2) + (stdev(groupB, field) ** 2)) / 2) || 1;
    return {
      field,
      aMean: a,
      bMean: b,
      delta: a === null || b === null ? null : a - b,
      effectSize: a === null || b === null ? 0 : (a - b) / pooled
    };
  }).sort((x, y) => Math.abs(y.effectSize) - Math.abs(x.effectSize));

  const categorical = [];
  for (const field of categoricalFields) {
    const aCounts = groupCounts(groupA, field);
    const bCounts = groupCounts(groupB, field);
    const values = unique([...aCounts.map((x) => x.value), ...bCounts.map((x) => x.value)]);
    for (const value of values) {
      const aCount = aCounts.find((x) => x.value === value)?.count || 0;
      const bCount = bCounts.find((x) => x.value === value)?.count || 0;
      const aShare = groupA.length ? aCount / groupA.length : 0;
      const bShare = groupB.length ? bCount / groupB.length : 0;
      categorical.push({ field, value, aShare, bShare, deltaShare: aShare - bShare });
    }
  }
  categorical.sort((x, y) => Math.abs(y.deltaShare) - Math.abs(x.deltaShare));
  return { numeric, categorical };
}

export function findOutliers(records, field, zThreshold = 2.5) {
  const avg = mean(records, field);
  const sd = stdev(records, field);
  if (avg === null || !sd) return [];
  return records
    .map((record) => ({ record, value: safeNumber(record[field]) }))
    .filter(({ value }) => value !== null)
    .map(({ record, value }) => ({ record, z: (value - avg) / sd }))
    .filter((x) => Math.abs(x.z) >= zThreshold)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export function rankCorrelations(records, targetField, numericFields = []) {
  return numericFields
    .filter((field) => field !== targetField)
    .map((field) => ({ field, correlation: pearson(records, field, targetField) }))
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

export function rankDiscriminatingFeatures(groupA, groupB, numericFields = [], categoricalFields = []) {
  const result = compareGroups(groupA, groupB, numericFields, categoricalFields);
  return [
    ...result.numeric.map((x) => ({ type: 'numeric', field: x.field, score: Math.abs(x.effectSize), detail: x })),
    ...result.categorical.slice(0, 20).map((x) => ({ type: 'categorical', field: x.field, value: x.value, score: Math.abs(x.deltaShare) * 3, detail: x }))
  ].sort((a, b) => b.score - a.score);
}

export function histogram(records, field, bins = 12) {
  const [min, max] = extent(records, field);
  const width = (max - min) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({
    min: min + i * width,
    max: i === bins - 1 ? max : min + (i + 1) * width,
    count: 0
  }));
  for (const record of records) {
    const value = safeNumber(record[field]);
    if (value === null) continue;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / width)));
    out[idx].count += 1;
  }
  return out;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(value);
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += ch;
    }
  }
  row.push(value);
  if (row.some((v) => v !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells, index) => {
    const record = { id: `row-${index + 1}` };
    headers.forEach((header, i) => {
      const raw = cells[i] ?? '';
      const n = Number(raw);
      record[header] = raw !== '' && Number.isFinite(n) ? n : raw;
    });
    if (headers.includes('id') && record.id) record.id = String(record.id);
    return record;
  });
}

export function inferDataset(records, title = 'Imported investigation') {
  const sample = records.slice(0, 100);
  const fields = unique(records.flatMap((r) => Object.keys(r))).filter((f) => f !== 'id');
  const numericThreshold = sample.length ? Math.max(1, Math.ceil(sample.length * 0.7)) : Infinity;
  const numericFields = fields.filter((field) => sample.filter((r) => safeNumber(r[field]) !== null).length >= numericThreshold);
  const timeField = fields.find((field) => /time|date/i.test(field) && sample.some((r) => !Number.isNaN(Date.parse(r[field]))));
  const keyFields = fields.filter((field) => !numericFields.includes(field) && field !== timeField).slice(0, 8);
  const x = numericFields[0] || fields[0];
  const y = numericFields[1] || numericFields[0] || fields[1] || fields[0];
  const color = keyFields[0] || fields.find((f) => f !== x && f !== y) || fields[0];
  const normalized = records.map((record, index) => ({ ...record, id: String(record.id || `row-${index + 1}`) }));
  return {
    id: `imported-${Date.now()}`,
    title,
    subtitle: `${normalized.length.toLocaleString()} imported records`,
    recordLabel: 'record',
    dimensions: { time: timeField || null, x, y, color, size: numericFields[2] || null },
    keyFields,
    numericFields,
    records: normalized,
    documents: [],
    graph: { nodes: [], edges: [] },
    starterHypotheses: []
  };
}


// POST_ZIP_ENHANCEMENTS_V2: core
const COUNTEREVIDENCE_STOPWORDS = new Set(['the','and','for','that','this','with','from','into','over','under','are','was','were','has','have','had','not','but','its','our','their','then','than','does','did','can','could','would','should','about','primary','caused','cause']);

export function evidenceTerms(value) {
  const text = Array.isArray(value) ? value.join(' ') : String(value ?? '');
  return [...new Set((text.toLowerCase().match(/[a-z0-9][a-z0-9._-]{2,}/g) || [])
    .filter((term) => !COUNTEREVIDENCE_STOPWORDS.has(term)))];
}

export function findCounterevidence(hypothesis, documents = [], limit = 8) {
  if (!hypothesis) return [];
  const terms = evidenceTerms([hypothesis.title, hypothesis.notes, ...(hypothesis.questions || [])]);
  const already = new Set([...(hypothesis.supporting || []), ...(hypothesis.contradicting || [])]);
  return documents
    .filter((doc) => !already.has(doc.id))
    .map((doc) => {
      const haystack = [doc.title, doc.type, doc.source, doc.text, ...(doc.tags || [])].join(' ').toLowerCase();
      const matchedTerms = terms.filter((term) => haystack.includes(term));
      const negationBonus = /normal|baseline|unchanged|independent|ruled out|no evidence|did not|does not|without/.test(haystack) ? 1.5 : 0;
      return { document: doc, score: matchedTerms.length + (matchedTerms.length ? negationBonus : 0), matchedTerms };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.document.id).localeCompare(String(b.document.id)))
    .slice(0, limit);
}

export function rankCategoricalConcentration(records, fields = []) {
  return fields.map((field) => {
    const counts = groupCounts(records, field);
    const top = counts[0] || { value: '∅', count: 0 };
    const share = records.length ? top.count / records.length : 0;
    const entropy = counts.reduce((sum, item) => {
      const p = records.length ? item.count / records.length : 0;
      return p ? sum - p * Math.log2(p) : sum;
    }, 0);
    return { field, topValue: top.value, topCount: top.count, share, entropy, distinct: counts.length };
  }).sort((a, b) => b.share - a.share || a.entropy - b.entropy);
}

export function buildReasoningGraph(hypotheses = [], documents = [], findings = [], causalLinks = []) {
  const nodes = [];
  const edges = [];
  const seen = new Set();
  const addNode = (node) => { if (!seen.has(node.id)) { seen.add(node.id); nodes.push(node); } };
  for (const h of hypotheses) {
    addNode({ id: h.id, label: h.title, type: 'hypothesis', confidence: h.confidence, status: h.status });
    if (h.parentId) {
      addNode({ id: h.parentId, label: hypotheses.find((candidate) => candidate.id === h.parentId)?.title || h.parentId, type: 'reference' });
      edges.push({ source: h.parentId, target: h.id, label: h.forkReason || 'alternative' });
    }
    for (const id of h.supporting || []) {
      const d = documents.find((x) => x.id === id);
      addNode({ id, label: d?.title || id, type: 'evidence', stance: 'supporting' });
      edges.push({ source: id, target: h.id, label: 'supports' });
    }
    for (const id of h.contradicting || []) {
      const d = documents.find((x) => x.id === id);
      addNode({ id, label: d?.title || id, type: 'evidence', stance: 'contradicting' });
      edges.push({ source: id, target: h.id, label: 'contradicts' });
    }
  }
  for (const f of findings) addNode({ id: f.id, label: f.title || f.text, type: 'finding', confidence: f.confidence });
  for (const link of causalLinks) {
    const sourceLabel = documents.find((d) => d.id === link.source)?.title || hypotheses.find((h) => h.id === link.source)?.title || findings.find((f) => f.id === link.source)?.title || link.source;
    const targetLabel = documents.find((d) => d.id === link.target)?.title || hypotheses.find((h) => h.id === link.target)?.title || findings.find((f) => f.id === link.target)?.title || link.target;
    addNode({ id: link.source, label: sourceLabel, type: 'reference' });
    addNode({ id: link.target, label: targetLabel, type: 'reference' });
    edges.push({ source: link.source, target: link.target, label: link.label || 'leads to', kind: 'causal' });
  }
  return { nodes, edges };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
