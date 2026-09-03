import { deepClone, filterRecords } from './core.js';
import { SAMPLE_DATASETS, cloneDataset } from './sampleData.js';

const STORAGE_KEY = 'investigation-canvas-state-v1';

function nowIso() { return new Date().toISOString(); }
function uid(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 9)}`; }

function initialState(dataset = cloneDataset(SAMPLE_DATASETS[0])) {
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
    activity: [{ id: uid('act'), at: nowIso(), source: 'system', kind: 'open', text: `Opened ${dataset.title}` }],
    webmcp: { available: false, registered: 0, lastError: null },
    ui: { leftCollapsed: false, rightCollapsed: false, inspectorOpen: true, denseTable: false },
    revision: 1
  };
}

export class InvestigationStore {
  constructor() {
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.state = initialState();
    this.loadPersisted();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    this.state.revision += 1;
    for (const listener of this.listeners) listener(this.state);
    this.persist();
  }

  snapshot() {
    const { dataset, datasets, webmcp, revision, ...mutable } = this.state;
    return deepClone({ ...mutable, dimensions: this.state.dimensions, hypotheses: this.state.hypotheses });
  }

  restoreSnapshot(snapshot) {
    const preserved = { dataset: this.state.dataset, datasets: this.state.datasets, webmcp: this.state.webmcp };
    this.state = { ...this.state, ...deepClone(snapshot), ...preserved };
    this.emit();
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
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    const next = this.redoStack.pop();
    this.restoreSnapshot(next);
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
    this.state = next;
    this.emit();
  }

  loadCustomDataset(dataset) {
    const next = initialState(deepClone(dataset));
    next.datasets = [...this.state.datasets.filter((d) => d.id !== dataset.id), { id: dataset.id, title: dataset.title }];
    next.webmcp = this.state.webmcp;
    this.undoStack = [];
    this.redoStack = [];
    this.state = next;
    this.emit();
  }

  getVisibleRecords() {
    return filterRecords(this.state.dataset.records, this.state.filters, this.state.search);
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
    this.mutate((s) => { s.filters.push({ id: uid('filter'), ...filter }); }, {
      activity: { source, kind: 'filter', text: `${source === 'agent' ? 'Agent added' : 'Added'} filter ${filter.field} ${filter.op || 'eq'} ${filter.value ?? `${filter.min}…${filter.max}`}` }
    });
  }

  removeFilter(id, source = 'human') {
    this.mutate((s) => { s.filters = s.filters.filter((f) => f.id !== id); }, {
      activity: { source, kind: 'filter', text: `${source === 'agent' ? 'Agent removed' : 'Removed'} a filter` }
    });
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
      confidence: Number(input.confidence ?? 50),
      status: input.status || 'testing',
      supporting: [...(input.supporting || [])],
      contradicting: [...(input.contradicting || [])],
      questions: [...(input.questions || [])],
      notes: input.notes || ''
    };
    this.mutate((s) => { s.hypotheses.unshift(hypothesis); s.activeTab = 'hypotheses'; }, {
      activity: { source, kind: 'hypothesis', text: `${source === 'agent' ? 'Agent proposed' : 'Created'} hypothesis: ${hypothesis.title}` }
    });
    return hypothesis;
  }

  updateHypothesis(id, patch, source = 'human') {
    let updated = null;
    this.mutate((s) => {
      const hypothesis = s.hypotheses.find((h) => h.id === id);
      if (!hypothesis) return;
      Object.assign(hypothesis, patch);
      if (patch.confidence !== undefined) hypothesis.confidence = Math.max(0, Math.min(100, Number(patch.confidence)));
      updated = deepClone(hypothesis);
    }, { activity: { source, kind: 'hypothesis', text: `${source === 'agent' ? 'Agent updated' : 'Updated'} hypothesis ${id}` } });
    return updated;
  }

  attachEvidence(hypothesisId, evidenceId, stance = 'supporting', source = 'human') {
    const field = stance === 'contradicting' ? 'contradicting' : 'supporting';
    this.mutate((s) => {
      const h = s.hypotheses.find((x) => x.id === hypothesisId);
      if (!h) return;
      h.supporting = h.supporting.filter((x) => x !== evidenceId);
      h.contradicting = h.contradicting.filter((x) => x !== evidenceId);
      h[field].push(evidenceId);
    }, { activity: { source, kind: 'evidence', text: `${source === 'agent' ? 'Agent attached' : 'Attached'} ${evidenceId} as ${field} evidence` } });
  }

  addAnnotation(input, source = 'human') {
    const annotation = { id: uid('ann'), createdAt: nowIso(), ...input };
    this.mutate((s) => { s.annotations.unshift(annotation); }, {
      activity: { source, kind: 'annotation', text: `${source === 'agent' ? 'Agent annotated' : 'Annotated'} ${input.targetType || 'workspace'}: ${input.text}` }
    });
    return annotation;
  }

  saveView(name, source = 'human') {
    const view = {
      id: uid('view'),
      name,
      createdAt: nowIso(),
      filters: deepClone(this.state.filters),
      search: this.state.search,
      selection: [...this.state.selection],
      dimensions: deepClone(this.state.dimensions)
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
    const branches = this.state.branches;
    this.restoreSnapshot(branch.snapshot);
    this.state.branches = branches;
    this.logActivity(`${source === 'agent' ? 'Agent restored' : 'Restored'} branch “${branch.name}”`, source, 'branch');
    return true;
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
      workspace: this.snapshot()
    };
  }

  importState(payload) {
    if (!payload?.dataset || !payload?.workspace) throw new Error('Invalid investigation export');
    this.state = { ...initialState(deepClone(payload.dataset)), ...deepClone(payload.workspace), dataset: deepClone(payload.dataset), webmcp: this.state.webmcp };
    this.emit();
  }

  persist() {
    try {
      const payload = {
        datasetId: SAMPLE_DATASETS.some((d) => d.id === this.state.dataset.id) ? this.state.dataset.id : null,
        customDataset: SAMPLE_DATASETS.some((d) => d.id === this.state.dataset.id) ? null : this.state.dataset,
        workspace: this.snapshot()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) { /* persistence is best-effort */ }
  }

  loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      const dataset = payload.customDataset || cloneDataset(SAMPLE_DATASETS.find((d) => d.id === payload.datasetId) || SAMPLE_DATASETS[0]);
      this.state = { ...initialState(dataset), ...payload.workspace, dataset, datasets: this.state.datasets, webmcp: this.state.webmcp };
    } catch (_) { /* ignore corrupt state */ }
  }
}
