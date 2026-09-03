import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
global.localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k,v) => mem.set(k,String(v)),
  removeItem: (k) => mem.delete(k)
};

const { InvestigationStore } = await import('../src/store.js');

test('store starts with sample dataset', () => {
  mem.clear(); const s = new InvestigationStore();
  assert.ok(s.state.dataset.records.length > 500);
});

test('selection is validated against record IDs', () => {
  mem.clear(); const s = new InvestigationStore();
  const id = s.state.dataset.records[0].id;
  s.setSelection([id,'missing']);
  assert.deepEqual(s.state.selection, [id]);
});

test('filter mutates visible records', () => {
  mem.clear(); const s = new InvestigationStore();
  const before = s.getVisibleRecords().length;
  s.addFilter({field:'platform',op:'eq',value:'mobile'});
  assert.ok(s.getVisibleRecords().length < before);
});

test('undo restores prior filter state', () => {
  mem.clear(); const s = new InvestigationStore();
  s.addFilter({field:'platform',op:'eq',value:'mobile'});
  assert.equal(s.state.filters.length,1);
  s.undo();
  assert.equal(s.state.filters.length,0);
});

test('redo reapplies state', () => {
  mem.clear(); const s = new InvestigationStore();
  s.addFilter({field:'platform',op:'eq',value:'mobile'}); s.undo(); s.redo();
  assert.equal(s.state.filters.length,1);
});

test('hypothesis creation works', () => {
  mem.clear(); const s = new InvestigationStore();
  const h=s.addHypothesis({title:'Test hypothesis',confidence:44});
  assert.equal(h.title,'Test hypothesis');
  assert.ok(s.state.hypotheses.some(x=>x.id===h.id));
});

test('hypothesis confidence is clamped on update', () => {
  mem.clear(); const s = new InvestigationStore(); const id=s.state.hypotheses[0].id;
  s.updateHypothesis(id,{confidence:150});
  assert.equal(s.state.hypotheses.find(h=>h.id===id).confidence,100);
});

test('evidence attachment switches stance cleanly', () => {
  mem.clear(); const s = new InvestigationStore(); const h=s.state.hypotheses[0]; const d=s.state.dataset.documents[0].id;
  s.attachEvidence(h.id,d,'supporting'); s.attachEvidence(h.id,d,'contradicting');
  const now=s.state.hypotheses.find(x=>x.id===h.id);
  assert.ok(!now.supporting.includes(d)); assert.ok(now.contradicting.includes(d));
});

test('saved view restores filters and selection', () => {
  mem.clear(); const s = new InvestigationStore(); const id=s.state.dataset.records[0].id;
  s.addFilter({field:'platform',op:'eq',value:'mobile'}); s.setSelection([id]); const v=s.saveView('x');
  s.clearFilters(); s.clearSelection(); s.restoreView(v.id);
  assert.equal(s.state.filters.length,1); assert.equal(s.state.selection.length,1);
});

test('branch restores earlier state', () => {
  mem.clear(); const s = new InvestigationStore(); s.addFilter({field:'platform',op:'eq',value:'mobile'}); const b=s.createBranch('before');
  s.clearFilters(); s.restoreBranch(b.id);
  assert.equal(s.state.filters.length,1);
});

test('export/import round trip preserves hypotheses', () => {
  mem.clear(); const s = new InvestigationStore(); s.addHypothesis({title:'Round trip'}); const payload=s.exportState();
  const t = new InvestigationStore(); t.importState(payload);
  assert.ok(t.state.hypotheses.some(h=>h.title==='Round trip'));
});
