import { deepClone, filterRecords, findCounterevidence } from './core.js';
import { SAMPLE_DATASETS, cloneDataset } from './sampleData.js';

const STORAGE_KEY = 'investigation-canvas-state-v1';
const FILTER_OPS = new Set(['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'between', 'in']);
const MAX_PERSISTABLE_CUSTOM_RECORDS = 500;
const MAX_PERSISTABLE_CUSTOM_CHARS = 250_000;

function isCustomDataset(dataset) {
  return Boolean(dataset?.id) && !SAMPLE_DATASETS.some((d) => d.id === dataset.id);
}
function nowIso() { return new Date().toISOString(); }
function uid(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 9)}`; }
const plainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback, min = -Infinity, max = Infinity) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const confidence = (value, fallback = 50) => finite(value, fallback, 0, 100);

// POST_ZIP_ENHANCEMENTS_V2: store
function defaultCanvasViews(dataset) {
  const hasTime = Boolean(dataset.dimensions?.time);
  return [
    { id: 'view-scatter', type: 'scatter', title: 'Linked scatter', x: 28, y: 28, w: 620, h: 350, agentCreated: false },
    { id: 'view-timeline', type: hasTime ? 'timeline' : 'selection', title: hasTime ? 'Timeline' : 'Selection comparison', x: 680, y: 28, w: 520, h: 300, agentCreated: false },
    { id: 'view-table', type: 'table', title: 'Evidence table', x: 28, y: 405, w: 620, h: 330, agentCreated: false },
    { id: 'view-graph', type: 'graph', title: 'Relationship graph', x: 680, y: 355, w: 520, h: 380, agentCreated: false },
    { id: 'view-evidence', type: 'evidence', title: 'Source evidence', x: 1230, y: 28, w: 500, h: 320, agentCreated: false },
    { id: 'view-hypotheses', type: 'hypotheses', title: 'Competing hypotheses', x: 1230, y: 380, w: 500, h: 355, agentCreated: false },
    { id: 'view-reasoning', type: 'reasoning', title: 'Reasoning graph', x: 28, y: 770, w: 760, h: 300, agentCreated: false },
    { id: 'view-rich-evidence', type: 'rich-evidence', title: 'Rich evidence', x: 820, y: 770, w: 560, h: 300, agentCreated: false }
  ];
}

function sanitizeProvenance(input, dataset) {
  const p = plainObject(input) ? input : {};
  const sanitized = {
    kind: String(p.kind || 'imported').slice(0, 40),
    label: String(p.label || dataset?.title || 'Imported dataset').slice(0, 100),
    description: String(p.description || dataset?.subtitle || 'Imported investigation data').slice(0, 300)
  };
  if (p.sourceUrl) sanitized.sourceUrl = String(p.sourceUrl).slice(0, 500);
  if (p.importedAt) sanitized.importedAt = String(p.importedAt).slice(0, 40);
  return sanitized;
}

function sanitizeDataset(input) {
  if (!plainObject(input) || !Array.isArray(input.records)) throw new Error('Invalid investigation dataset');
  const dataset = deepClone(input);
  dataset.id = String(dataset.id || `imported-${Date.now()}`);
  dataset.title = String(dataset.title || 'Imported investigation');
  dataset.subtitle = String(dataset.subtitle || `${dataset.records.length.toLocaleString()} imported records`);
  dataset.recordLabel = String(dataset.recordLabel || 'record');
  dataset.records = dataset.records.filter(plainObject).map((record, index) => ({ ...record, id: String(record.id || `row-${index + 1}`) }));
  if (!dataset.records.length || new Set(dataset.records.map((record) => record.id)).size !== dataset.records.length) throw new Error('Dataset record IDs must be present and unique');
  dataset.documents = list(dataset.documents).filter(plainObject).map((document, index) => ({ ...document, id: String(document.id || `document-${index + 1}`) }));
  if (new Set(dataset.documents.map((document) => document.id)).size !== dataset.documents.length) throw new Error('Dataset document IDs must be unique');
  dataset.numericFields = list(dataset.numericFields).map(String);
  dataset.keyFields = list(dataset.keyFields).map(String);
  dataset.dimensions = plainObject(dataset.dimensions) ? dataset.dimensions : {};
  dataset.graph = plainObject(dataset.graph) ? dataset.graph : {};
  dataset.graph.nodes = list(dataset.graph.nodes).filter(plainObject).map((node, index) => ({ ...node, id: String(node.id || `node-${index + 1}`) }));
  dataset.graph.edges = list(dataset.graph.edges).filter(plainObject).map((edge, index) => ({ ...edge, id: String(edge.id || `edge-${index + 1}`), source: String(edge.source || ''), target: String(edge.target || '') }));
  dataset.starterHypotheses = list(dataset.starterHypotheses);
  dataset.starterFindings = list(dataset.starterFindings);
  dataset.starterCausalLinks = list(dataset.starterCausalLinks);
  dataset.provenance = sanitizeProvenance(input.provenance, dataset);
  return dataset;
}

function sanitizeCanvas(input, dataset) {
  const fallback = { zoom: 1, panX: 0, panY: 0, focusedViewId: 'view-scatter', links: [], views: defaultCanvasViews(dataset) };
  const canvas = plainObject(input) ? input : fallback;
  const seen = new Set();
  const views = list(canvas.views).filter(plainObject).map((view, index) => ({
    id: String(view.id || `canvas-${index + 1}`),
    type: String(view.type || 'summary'),
    title: String(view.title || 'Analysis view'),
    x: finite(view.x, 80), y: finite(view.y, 80),
    w: finite(view.w, 480, 240), h: finite(view.h, 300, 160),
    content: String(view.content || ''),
    evidenceId: view.evidenceId == null || !dataset?.documents?.some((d) => d.id === String(view.evidenceId)) ? null : String(view.evidenceId),
    agentCreated: Boolean(view.agentCreated)
  })).filter((view) => !seen.has(view.id) && seen.add(view.id));
  const normalizedViews = views.length ? views : defaultCanvasViews(dataset);
  const ids = new Set(normalizedViews.map((view) => view.id));
  const links = list(canvas.links).filter((link) => plainObject(link) && ids.has(String(link.source)) && ids.has(String(link.target)) && String(link.source) !== String(link.target)).map((link, index) => ({
    id: String(link.id || `canvas-link-${index + 1}`), source: String(link.source), target: String(link.target), label: String(link.label || 'relates to')
  }));
  const focused = String(canvas.focusedViewId || '');
  return {
    zoom: finite(canvas.zoom, 1, 0.4, 2.2), panX: finite(canvas.panX, 0), panY: finite(canvas.panY, 0),
    focusedViewId: ids.has(focused) ? focused : normalizedViews[0]?.id || null,
    links, views: normalizedViews
  };
}

function snapshotFromState(state) {
  const { dataset, datasets, webmcp, persistence, revision, branches, activity, ...mutable } = state;
  return deepClone(mutable);
}

function serializeWorkspace(state) {
  return { ...snapshotFromState(state), branches: deepClone(state.branches), activity: deepClone(state.activity) };
}

function sanitizeWorkspace(input, dataset, includeBranches = true) {
  const base = initialState(dataset);
  const workspace = plainObject(input) ? input : {};
  const recordIds = new Set(dataset.records.map((record) => record.id));
  const documentIds = new Set(dataset.documents.map((document) => document.id));
  const nodeIds = new Set(list(dataset.graph?.nodes).map((node) => String(node.id)));
  const tabs = new Set(['explore', 'canvas', 'hypotheses', 'evidence', 'provenance']);
  const filters = list(workspace.filters).filter((filter) => plainObject(filter) && filter.field).map((filter) => ({
    id: String(filter.id || uid('filter')), field: String(filter.field), op: FILTER_OPS.has(filter.op) ? filter.op : 'eq', value: filter.value, min: filter.min, max: filter.max
  }));
  const hypotheses = list(workspace.hypotheses).filter(plainObject).map((hypothesis) => ({
    id: String(hypothesis.id || uid('hyp')), title: String(hypothesis.title || 'Untitled hypothesis'),
    confidence: confidence(hypothesis.confidence), status: String(hypothesis.status || 'testing'),
    supporting: list(hypothesis.supporting).map(String).filter((id) => documentIds.has(id)),
    contradicting: list(hypothesis.contradicting).map(String).filter((id) => documentIds.has(id)),
    questions: list(hypothesis.questions).map(String), notes: String(hypothesis.notes || ''),
    parentId: hypothesis.parentId == null ? null : String(hypothesis.parentId), forkReason: String(hypothesis.forkReason || '')
  }));
  const canvas = sanitizeCanvas(workspace.canvas, dataset);
  const result = {
    ...base,
    filters,
    search: String(workspace.search || ''),
    selection: list(workspace.selection).map(String).filter((id) => recordIds.has(id)),
    focusedRecordId: recordIds.has(String(workspace.focusedRecordId)) ? String(workspace.focusedRecordId) : null,
    focusedDocumentId: documentIds.has(String(workspace.focusedDocumentId)) ? String(workspace.focusedDocumentId) : null,
    focusedGraphNodeId: nodeIds.has(String(workspace.focusedGraphNodeId)) ? String(workspace.focusedGraphNodeId) : null,
    activeTab: tabs.has(workspace.activeTab) ? workspace.activeTab : 'explore',
    viewMode: String(workspace.viewMode || 'split'),
    dimensions: plainObject(workspace.dimensions) ? { ...base.dimensions, ...workspace.dimensions } : base.dimensions,
    hypotheses,
    annotations: list(workspace.annotations).filter(plainObject).map((annotation) => ({ ...annotation, id: String(annotation.id || uid('ann')), text: String(annotation.text || '') })),
    savedViews: list(workspace.savedViews).filter(plainObject).map((view) => ({
      id: String(view.id || uid('view')), name: String(view.name || 'Saved view'), createdAt: String(view.createdAt || nowIso()),
      filters: list(view.filters).filter((filter) => plainObject(filter) && filter.field).map((filter) => ({
        id: String(filter.id || uid('filter')), field: String(filter.field), op: FILTER_OPS.has(filter.op) ? filter.op : 'eq', value: filter.value, min: filter.min, max: filter.max
      })), search: String(view.search || ''),
      selection: list(view.selection).map(String).filter((id) => recordIds.has(id)),
      dimensions: plainObject(view.dimensions) ? { ...base.dimensions, ...view.dimensions } : base.dimensions,
      canvas: sanitizeCanvas(view.canvas, dataset)
    })),
    findings: list(workspace.findings ?? base.findings).filter(plainObject).map((finding) => ({
      ...finding, id: String(finding.id || uid('finding')), title: String(finding.title || 'Finding'), text: String(finding.text || ''),
      confidence: confidence(finding.confidence, 60), evidenceIds: list(finding.evidenceIds).map(String).filter((id) => documentIds.has(id))
    })),
    causalLinks: (() => {
      const validCausalEndpoints = new Set([
        ...nodeIds, ...documentIds,
        ...hypotheses.map((h) => h.id),
        ...list(workspace.findings ?? base.findings).filter(plainObject).map((f) => String(f.id || ''))
      ]);
      return list(workspace.causalLinks ?? base.causalLinks).filter((link) => plainObject(link) && link.source && link.target && validCausalEndpoints.has(String(link.source)) && validCausalEndpoints.has(String(link.target))).map((link) => ({
        ...link, id: String(link.id || uid('cause')), source: String(link.source), target: String(link.target), label: String(link.label || 'leads to'), confidence: confidence(link.confidence)
      }));
    })(),
    canvas,
    activity: list(workspace.activity).filter(plainObject).map((entry) => ({ ...entry, id: String(entry.id || uid('act')), text: String(entry.text || '') })).slice(0, 120),
    ui: plainObject(workspace.ui) ? { ...base.ui, ...workspace.ui } : base.ui,
    revision: Math.max(1, Math.trunc(finite(workspace.revision, 1)))
  };
  if (!result.activity.length) result.activity = base.activity;
  result.branches = includeBranches ? list(workspace.branches).filter(plainObject).map((branch) => ({
    id: String(branch.id || uid('branch')), name: String(branch.name || 'Branch'), createdAt: String(branch.createdAt || nowIso()),
    snapshot: snapshotFromState(sanitizeWorkspace(branch.snapshot, dataset, false))
  })) : [];
  return result;
}

function ensureEnhancedState(state) {
  state.findings = list(state.findings ?? state.dataset?.starterFindings).filter(plainObject);
  const validCausalEndpoints = new Set([
    ...list(state.dataset?.graph?.nodes).map((n) => String(n.id)),
    ...list(state.dataset?.documents).map((d) => String(d.id)),
    ...list(state.hypotheses).map((h) => String(h.id)),
    ...list(state.findings).map((f) => String(f.id))
  ]);
  state.causalLinks = list(state.causalLinks ?? state.dataset?.starterCausalLinks).filter((link) => plainObject(link) && link.source && link.target && validCausalEndpoints.has(String(link.source)) && validCausalEndpoints.has(String(link.target)));
  state.canvas = sanitizeCanvas(state.canvas, state.dataset);
  return state;
}

function initialState(dataset = cloneDataset(SAMPLE_DATASETS[0])) {
  if (dataset) dataset.provenance = sanitizeProvenance(dataset.provenance, dataset);
  return {
    dataset,
    datasets: SAMPLE_DATASETS.map((d) => ({ id: d.id, title: d.title })),
    filters: [],
    search: '',
    selection: [],
    focusedRecordId: null,
    focusedDocumentId: null,
    focusedGraphNodeId: null,
    activeTab: 'explore',
    viewMode: 'split',
    dimensions: deepClone(dataset.dimensions),
    hypotheses: deepClone(dataset.starterHypotheses || []),
    annotations: [],
    savedViews: [],
    branches: [],
    findings: deepClone(dataset.starterFindings || []),
    causalLinks: deepClone(dataset.starterCausalLinks || []),
    canvas: { zoom: 1, panX: 0, panY: 0, focusedViewId: 'view-scatter', links: [], views: defaultCanvasViews(dataset) },
    activity: [{ id: uid('act'), at: nowIso(), source: 'system', kind: 'open', text: `Opened ${dataset.title}` }],
    webmcp: { available: false, registered: 0, lastError: null },
    persistence: { ok: true, lastError: null },
    ui: { leftCollapsed: false, rightCollapsed: false, inspectorOpen: true, denseTable: false },
    revision: 1
  };
}

export class InvestigationStore {
  constructor() {
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this._visibleRecordsCache = null;
    this._cachedCustomDatasetRef = null;
    this._cachedCustomDatasetJson = null;
    this.state = initialState();
    this.loadPersisted();
    ensureEnhancedState(this.state);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    this.state.revision += 1;
    this.persist();
    for (const listener of this.listeners) listener(this.state);
  }

  snapshot() {
    return snapshotFromState(this.state);
  }

  restoreSnapshot(snapshot) {
    const preserved = { dataset: this.state.dataset, datasets: this.state.datasets, webmcp: this.state.webmcp, persistence: this.state.persistence, branches: this.state.branches, activity: this.state.activity, revision: this.state.revision };
    this.state = { ...sanitizeWorkspace(snapshot, this.state.dataset, false), ...preserved };
    ensureEnhancedState(this.state);
  }

  mutate(mutator, { history = true, activity = null } = {}) {
    if (history) {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
    }
    mutator(this.state);
    if (activity) this.logActivity(activity.text, activity.source || 'human', activity.kind || 'change', false);
    this.emit();
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.snapshot());
    const previous = this.undoStack.pop();
    this.restoreSnapshot(previous);
    this.logActivity('Undid the previous workspace change', 'human', 'history', false);
    this.emit();
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    const next = this.redoStack.pop();
    this.restoreSnapshot(next);
    this.logActivity('Redid the previous workspace change', 'human', 'history', false);
    this.emit();
    return true;
  }

  logActivity(text, source = 'human', kind = 'change', emit = true) {
    this.state.activity.unshift({ id: uid('act'), at: nowIso(), source, kind, text });
    this.state.activity = this.state.activity.slice(0, 120);
    if (emit) this.emit();
  }

  loadDataset(datasetId) {
    const dataset = cloneDataset(SAMPLE_DATASETS.find((d) => d.id === datasetId) || SAMPLE_DATASETS[0]);
    const next = initialState(dataset);
    next.datasets = this.state.datasets;
    next.webmcp = this.state.webmcp;
    this.undoStack = [];
    this.redoStack = [];
    this.invalidateVisibleRecordsCache();
    this._cachedCustomDatasetRef = null;
    this._cachedCustomDatasetJson = null;
    this.state = next;
    this.emit();
  }

  loadCustomDataset(dataset) {
    dataset = sanitizeDataset(dataset);
    const next = initialState(dataset);
    next.datasets = [...this.state.datasets.filter((d) => d.id !== dataset.id), { id: dataset.id, title: dataset.title }];
    next.webmcp = this.state.webmcp;
    this.undoStack = [];
    this.redoStack = [];
    this.invalidateVisibleRecordsCache();
    this._cachedCustomDatasetRef = null;
    this._cachedCustomDatasetJson = null;
    this.state = next;
    this.emit();
  }

  invalidateVisibleRecordsCache() {
    this._visibleRecordsCache = null;
  }

  getVisibleRecords() {
    const dataset = this.state.dataset;
    const records = dataset?.records || [];
    const search = this.state.search || '';
    const filters = this.state.filters || [];
    const filterKey = JSON.stringify(filters);
    if (
      this._visibleRecordsCache &&
      this._visibleRecordsCache.dataset === dataset &&
      this._visibleRecordsCache.records === records &&
      this._visibleRecordsCache.search === search &&
      this._visibleRecordsCache.filterKey === filterKey
    ) {
      return this._visibleRecordsCache.result;
    }
    const result = filterRecords(records, filters, search);
    this._visibleRecordsCache = {
      dataset,
      records,
      search,
      filterKey,
      result
    };
    return result;
  }

  getSelectedRecords() {
    const ids = new Set(this.state.selection);
    return this.state.dataset.records.filter((r) => ids.has(r.id));
  }

  setSelection(ids, source = 'human') {
    const valid = new Set(this.state.dataset.records.map((r) => r.id));
    const selection = [...new Set(ids)].filter((id) => valid.has(id));
    this.mutate((s) => { s.selection = selection; }, {
      activity: { source, kind: 'selection', text: `${source === 'agent' ? 'Agent selected' : 'Selected'} ${selection.length} ${this.state.dataset.recordLabel}${selection.length === 1 ? '' : 's'}` }
    });
  }

  toggleSelection(id, additive = false, source = 'human') {
    const current = new Set(additive ? this.state.selection : []);
    if (current.has(id)) current.delete(id); else current.add(id);
    this.setSelection([...current], source);
  }

  clearSelection(source = 'human') {
    if (!this.state.selection.length) return;
    this.setSelection([], source);
  }

  addFilter(filter, source = 'human') {
    if (!filter?.field || !FILTER_OPS.has(filter.op || 'eq')) return null;
    const created = { id: uid('filter'), ...filter, field: String(filter.field), op: filter.op || 'eq' };
    this.mutate((s) => { s.filters.push(created); }, {
      activity: { source, kind: 'filter', text: `${source === 'agent' ? 'Agent added' : 'Added'} filter ${filter.field} ${filter.op || 'eq'} ${filter.value ?? `${filter.min}…${filter.max}`}` }
    });
    return deepClone(created);
  }

  removeFilter(id, source = 'human') {
    if (!this.state.filters.some((filter) => filter.id === id)) return false;
    this.mutate((s) => { s.filters = s.filters.filter((f) => f.id !== id); }, {
      activity: { source, kind: 'filter', text: `${source === 'agent' ? 'Agent removed' : 'Removed'} a filter` }
    });
    return true;
  }

  clearFilters(source = 'human') {
    this.mutate((s) => { s.filters = []; s.search = ''; }, {
      activity: { source, kind: 'filter', text: `${source === 'agent' ? 'Agent cleared' : 'Cleared'} all filters` }
    });
  }

  setSearch(search) {
    this.mutate((s) => { s.search = search; }, { history: false });
  }

  setDimension(key, field, source = 'human') {
    this.mutate((s) => { s.dimensions[key] = field; }, {
      activity: { source, kind: 'view', text: `${source === 'agent' ? 'Agent changed' : 'Changed'} ${key} dimension to ${field}` }
    });
  }

  addHypothesis(input, source = 'human') {
    const hypothesis = {
      id: input.id || uid('hyp'),
      title: input.title,
      confidence: confidence(input.confidence),
      status: input.status || 'testing',
      supporting: [...(input.supporting || [])],
      contradicting: [...(input.contradicting || [])],
      questions: [...(input.questions || [])],
      notes: input.notes || '',
      parentId: input.parentId || null,
      forkReason: input.forkReason || ''
    };
    this.mutate((s) => { s.hypotheses.unshift(hypothesis); s.activeTab = 'hypotheses'; }, {
      activity: { source, kind: 'hypothesis', text: `${source === 'agent' ? 'Agent proposed' : 'Created'} hypothesis: ${hypothesis.title}` }
    });
    return hypothesis;
  }

  updateHypothesis(id, patch, source = 'human') {
    if (!this.state.hypotheses.some((hypothesis) => hypothesis.id === id)) return null;
    let updated = null;
    this.mutate((s) => {
      const hypothesis = s.hypotheses.find((h) => h.id === id);
      if (!hypothesis) return;
      Object.assign(hypothesis, patch);
      if (patch.confidence !== undefined) hypothesis.confidence = confidence(patch.confidence, hypothesis.confidence);
      updated = deepClone(hypothesis);
    }, { activity: { source, kind: 'hypothesis', text: `${source === 'agent' ? 'Agent updated' : 'Updated'} hypothesis ${id}` } });
    return updated;
  }

  attachEvidence(hypothesisId, evidenceId, stance = 'supporting', source = 'human') {
    const hypothesis = this.state.hypotheses.find((item) => item.id === hypothesisId);
    if (!hypothesis || !this.state.dataset.documents.some((document) => document.id === evidenceId)) return null;
    const field = stance === 'contradicting' ? 'contradicting' : 'supporting';
    this.mutate((s) => {
      const h = s.hypotheses.find((x) => x.id === hypothesisId);
      if (!h) return;
      h.supporting = h.supporting.filter((x) => x !== evidenceId);
      h.contradicting = h.contradicting.filter((x) => x !== evidenceId);
      h[field].push(evidenceId);
    }, { activity: { source, kind: 'evidence', text: `${source === 'agent' ? 'Agent attached' : 'Attached'} ${evidenceId} as ${field} evidence` } });
    return deepClone(this.state.hypotheses.find((item) => item.id === hypothesisId));
  }

  addAnnotation(input = {}, source = 'human') {
    const targetType = input.targetType || 'workspace';
    const targetId = input.targetId ? String(input.targetId) : null;
    if (targetId) {
      if (targetType === 'record' && !this.state.dataset.records.some((r) => r.id === targetId)) return null;
      if (targetType === 'document' && !this.state.dataset.documents.some((d) => d.id === targetId)) return null;
      if (targetType === 'graph-node' && !this.state.dataset.graph?.nodes?.some((n) => n.id === targetId)) return null;
      if (targetType === 'hypothesis' && !this.state.hypotheses.some((h) => h.id === targetId)) return null;
    }
    const annotation = { id: uid('ann'), createdAt: nowIso(), ...input, targetType, targetId, text: String(input.text || '') };
    this.mutate((s) => { s.annotations.unshift(annotation); }, {
      activity: { source, kind: 'annotation', text: `${source === 'agent' ? 'Agent annotated' : 'Annotated'} ${targetType}: ${annotation.text}` }
    });
    return deepClone(annotation);
  }

  saveView(name, source = 'human') {
    const view = {
      id: uid('view'),
      name,
      createdAt: nowIso(),
      filters: deepClone(this.state.filters),
      search: this.state.search,
      selection: [...this.state.selection],
      dimensions: deepClone(this.state.dimensions),
      canvas: deepClone(this.state.canvas)
    };
    this.mutate((s) => { s.savedViews.unshift(view); }, {
      activity: { source, kind: 'view', text: `${source === 'agent' ? 'Agent saved' : 'Saved'} view “${name}”` }
    });
    return view;
  }

  restoreView(id, source = 'human') {
    const view = this.state.savedViews.find((v) => v.id === id);
    if (!view) return false;
    this.mutate((s) => {
      s.filters = deepClone(view.filters);
      s.search = view.search;
      s.selection = [...view.selection];
      s.dimensions = deepClone(view.dimensions);
      if (view.canvas) s.canvas = sanitizeCanvas(view.canvas, s.dataset);
    }, { activity: { source, kind: 'view', text: `${source === 'agent' ? 'Agent restored' : 'Restored'} view “${view.name}”` } });
    return true;
  }

  createBranch(name, source = 'human') {
    const branch = { id: uid('branch'), name, createdAt: nowIso(), snapshot: this.snapshot() };
    this.mutate((s) => { s.branches.unshift(branch); }, {
      activity: { source, kind: 'branch', text: `${source === 'agent' ? 'Agent created' : 'Created'} investigation branch “${name}”` }
    });
    return { id: branch.id, name: branch.name, createdAt: branch.createdAt };
  }

  restoreBranch(id, source = 'human') {
    const branch = this.state.branches.find((b) => b.id === id);
    if (!branch) return false;
    this.restoreSnapshot(branch.snapshot);
    this.logActivity(`${source === 'agent' ? 'Agent restored' : 'Restored'} branch “${branch.name}”`, source, 'branch', false);
    this.emit();
    return true;
  }


  addCanvasView(input = {}, source = 'human') {
    if (input.evidenceId && !this.state.dataset.documents.some((d) => d.id === input.evidenceId)) return null;
    const view = {
      id: input.id || uid('canvas'),
      type: input.type || 'summary',
      title: input.title || 'Analysis view',
      x: finite(input.x, 80), y: finite(input.y, 80),
      w: finite(input.w, 480, 260), h: finite(input.h, 300, 180),
      content: input.content || '',
      evidenceId: input.evidenceId ? String(input.evidenceId) : null,
      agentCreated: input.agentCreated ?? source === 'agent'
    };
    this.mutate((s) => { ensureEnhancedState(s); s.canvas.views.push(view); s.canvas.focusedViewId = view.id; s.activeTab = 'canvas'; }, {
      activity: { source, kind: 'canvas', text: `${source === 'agent' ? 'Agent created' : 'Created'} ${view.type} canvas view “${view.title}”` }
    });
    return deepClone(view);
  }

  updateCanvasView(id, patch = {}, source = 'human', history = true) {
    if (!this.state.canvas.views.some((view) => view.id === id)) return null;
    if (patch.evidenceId && !this.state.dataset.documents.some((d) => d.id === patch.evidenceId)) return null;
    let updated = null;
    this.mutate((s) => {
      ensureEnhancedState(s);
      const view = s.canvas.views.find((v) => v.id === id);
      if (!view) return;
      for (const key of ['title','type','content']) if (patch[key] !== undefined) view[key] = String(patch[key]);
      if (patch.evidenceId !== undefined) view.evidenceId = patch.evidenceId == null ? null : String(patch.evidenceId);
      if (patch.x !== undefined) view.x = finite(patch.x, view.x);
      if (patch.y !== undefined) view.y = finite(patch.y, view.y);
      if (patch.w !== undefined) view.w = finite(patch.w, view.w, 240);
      if (patch.h !== undefined) view.h = finite(patch.h, view.h, 160);
      updated = deepClone(view);
    }, { history, activity: history ? { source, kind: 'canvas', text: `${source === 'agent' ? 'Agent changed' : 'Changed'} canvas view ${id}` } : null });
    return updated;
  }

  removeCanvasView(id, source = 'human') {
    if (!this.state.canvas.views.some((view) => view.id === id)) return false;
    this.mutate((s) => {
      ensureEnhancedState(s);
      s.canvas.views = s.canvas.views.filter((v) => v.id !== id);
      s.canvas.links = s.canvas.links.filter((l) => l.source !== id && l.target !== id);
      if (s.canvas.focusedViewId === id) s.canvas.focusedViewId = s.canvas.views[0]?.id || null;
    }, { activity: { source, kind: 'canvas', text: `${source === 'agent' ? 'Agent removed' : 'Removed'} canvas view ${id}` } });
    return true;
  }

  focusCanvasView(id, source = 'human') {
    if (!this.state.canvas.views.some((view) => view.id === id)) return false;
    this.mutate((s) => { ensureEnhancedState(s); if (s.canvas.views.some((v) => v.id === id)) { s.canvas.focusedViewId = id; s.activeTab = 'canvas'; } }, {
      history: false, activity: { source, kind: 'canvas', text: `${source === 'agent' ? 'Agent focused' : 'Focused'} canvas view ${id}` }
    });
    return true;
  }

  linkCanvasViews(sourceId, targetId, label = 'relates to', source = 'human') {
    if (sourceId === targetId) return null;
    if (!this.state.canvas.views.some((view) => view.id === sourceId) || !this.state.canvas.views.some((view) => view.id === targetId)) return null;
    const link = { id: uid('link'), source: sourceId, target: targetId, label };
    this.mutate((s) => { ensureEnhancedState(s); if (s.canvas.views.some((v) => v.id === sourceId) && s.canvas.views.some((v) => v.id === targetId)) s.canvas.links.push(link); }, {
      activity: { source, kind: 'canvas', text: `${source === 'agent' ? 'Agent linked' : 'Linked'} ${sourceId} → ${targetId}` }
    });
    return link;
  }

  setCanvasViewport(patch = {}, source = 'human') {
    this.mutate((s) => {
      ensureEnhancedState(s);
      if (patch.zoom !== undefined) s.canvas.zoom = finite(patch.zoom, s.canvas.zoom, 0.4, 2.2);
      if (patch.panX !== undefined) s.canvas.panX = finite(patch.panX, s.canvas.panX);
      if (patch.panY !== undefined) s.canvas.panY = finite(patch.panY, s.canvas.panY);
    }, { history: false });
  }

  arrangeCanvas(mode = 'grid', source = 'human') {
    this.mutate((s) => {
      ensureEnhancedState(s);
      const views = s.canvas.views;
      if (mode === 'focus' && s.canvas.focusedViewId) {
        const focused = views.find((v) => v.id === s.canvas.focusedViewId);
        if (focused) { focused.x = 24; focused.y = 24; focused.w = 930; focused.h = 610; }
        views.filter((v) => v.id !== s.canvas.focusedViewId).forEach((v, i) => {
          v.x = 990 + (i % 2) * 370; v.y = 24 + Math.floor(i / 2) * 245; v.w = 340; v.h = 215;
        });
      } else {
        views.forEach((v, i) => { v.x = 28 + (i % 3) * 560; v.y = 28 + Math.floor(i / 3) * 360; v.w = 520; v.h = 325; });
      }
      s.canvas.panX = 0; s.canvas.panY = 0; s.canvas.zoom = mode === 'focus' ? 0.86 : 0.78;
    }, { activity: { source, kind: 'canvas', text: `${source === 'agent' ? 'Agent arranged' : 'Arranged'} canvas (${mode})` } });
  }

  createFinding(input = {}, source = 'human') {
    const validEvidence = new Set(this.state.dataset.documents.map((document) => document.id));
    const finding = { id: input.id || uid('finding'), title: input.title || 'Finding', text: input.text || '', confidence: confidence(input.confidence, 60), evidenceIds: list(input.evidenceIds).filter((id) => validEvidence.has(id)), createdAt: nowIso(), source };
    this.mutate((s) => { ensureEnhancedState(s); s.findings.unshift(finding); }, { activity: { source, kind: 'finding', text: `${source === 'agent' ? 'Agent recorded' : 'Recorded'} finding: ${finding.title}` } });
    return deepClone(finding);
  }

  addCausalLink(input = {}, source = 'human') {
    const validIds = new Set([
      ...this.state.dataset.graph.nodes.map((node) => node.id), ...this.state.dataset.documents.map((document) => document.id),
      ...this.state.hypotheses.map((hypothesis) => hypothesis.id), ...this.state.findings.map((finding) => finding.id)
    ]);
    if (!validIds.has(input.source) || !validIds.has(input.target)) return null;
    const link = { id: input.id || uid('cause'), source: input.source, target: input.target, label: input.label || 'leads to', confidence: confidence(input.confidence), createdAt: nowIso() };
    this.mutate((s) => { ensureEnhancedState(s); s.causalLinks.push(link); }, { activity: { source, kind: 'causal', text: `${source === 'agent' ? 'Agent linked' : 'Linked'} ${link.source} → ${link.target} causally` } });
    return deepClone(link);
  }

  forkHypothesis(parentId, input = {}, source = 'human') {
    const parent = this.state.hypotheses.find((h) => h.id === parentId);
    if (!parent) return null;
    return this.addHypothesis({
      title: input.title || `${parent.title} — alternative`, confidence: input.confidence ?? Math.max(20, Number(parent.confidence) - 15),
      status: input.status || 'testing', questions: input.questions || [...(parent.questions || [])], notes: input.notes || '',
      parentId, forkReason: input.forkReason || 'Alternative explanation'
    }, source);
  }

  discoverCounterevidence(hypothesisId, limit = 8) {
    const hypothesis = this.state.hypotheses.find((h) => h.id === hypothesisId);
    return findCounterevidence(hypothesis, this.state.dataset.documents, limit);
  }

  setWebMcpStatus(patch) {
    Object.assign(this.state.webmcp, patch);
    this.emit();
  }

  exportState() {
    return {
      format: 'investigation-canvas/v1',
      exportedAt: nowIso(),
      dataset: deepClone(this.state.dataset),
      workspace: serializeWorkspace(this.state)
    };
  }

  importState(payload) {
    if (payload?.format !== 'investigation-canvas/v1' || !payload?.dataset || !payload?.workspace) throw new Error('Invalid investigation export');
    const dataset = sanitizeDataset(payload.dataset);
    const preserved = { webmcp: this.state.webmcp, persistence: this.state.persistence };
    this.state = { ...sanitizeWorkspace(payload.workspace, dataset), dataset, datasets: this.state.datasets, ...preserved };
    this.undoStack = [];
    this.redoStack = [];
    this.invalidateVisibleRecordsCache();
    this._cachedCustomDatasetRef = null;
    this._cachedCustomDatasetJson = null;
    this.emit();
  }

  _isLargeCustomDataset(dataset) {
    if (!isCustomDataset(dataset)) return false;
    const count = Array.isArray(dataset.records) ? dataset.records.length : 0;
    if (count > MAX_PERSISTABLE_CUSTOM_RECORDS) return true;
    const cached = this._getSerializedCustomDataset(dataset);
    return cached == null || cached.length > MAX_PERSISTABLE_CUSTOM_CHARS;
  }

  _getSerializedCustomDataset(dataset) {
    if (!isCustomDataset(dataset)) return null;
    if (this._cachedCustomDatasetRef === dataset && this._cachedCustomDatasetJson !== undefined) {
      return this._cachedCustomDatasetJson;
    }
    this._cachedCustomDatasetRef = dataset;
    this._cachedCustomDatasetJson = JSON.stringify(dataset);
    return this._cachedCustomDatasetJson;
  }

  persist() {
    try {
      const dataset = this.state.dataset;
      const custom = isCustomDataset(dataset);
      if (custom && this._isLargeCustomDataset(dataset)) {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        this.state.persistence = {
          ok: false,
          lastError: 'Large dataset is session-only; workspace changes are not persisted to browser storage'
        };
        return false;
      }
      let payloadJson;
      const workspaceJson = JSON.stringify(serializeWorkspace(this.state));
      if (custom) {
        const customJson = this._getSerializedCustomDataset(dataset);
        payloadJson = `{"datasetId":null,"customDataset":${customJson},"workspace":${workspaceJson}}`;
      } else {
        const sampleIdJson = JSON.stringify(dataset?.id || null);
        payloadJson = `{"datasetId":${sampleIdJson},"customDataset":null,"workspace":${workspaceJson}}`;
      }
      localStorage.setItem(STORAGE_KEY, payloadJson);
      this.state.persistence = { ok: true, lastError: null };
      return true;
    } catch (error) {
      this.state.persistence = { ok: false, lastError: error?.message || 'Browser storage failed' };
      return false;
    }
  }

  loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      const dataset = sanitizeDataset(payload.customDataset || cloneDataset(SAMPLE_DATASETS.find((d) => d.id === payload.datasetId) || SAMPLE_DATASETS[0]));
      const runtime = { datasets: this.state.datasets, webmcp: this.state.webmcp, persistence: this.state.persistence };
      this.state = { ...sanitizeWorkspace(payload.workspace, dataset), dataset, ...runtime };
    } catch (error) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore storage cleanup failure */ }
      this.state = initialState();
      this.state.persistence = { ok: false, lastError: `Recovered from invalid saved state: ${error?.message || 'unknown error'}` };
    }
  }

  hasWorkspaceChanges() {
    return this.undoStack.length > 0;
  }
}
