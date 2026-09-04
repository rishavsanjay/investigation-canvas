import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage as mem } from './testStorage.js';

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

test('branch snapshots stay flat and survive export', () => {
  mem.clear(); const s=new InvestigationStore();
  for(let i=0;i<12;i+=1)s.createBranch(`branch ${i}`);
  const payload=s.exportState();
  assert.equal(payload.workspace.branches.length,12);
  assert.ok(payload.workspace.branches.every(branch=>!Object.hasOwn(branch.snapshot,'branches')));
  assert.ok(JSON.stringify(payload).length<1000000);
});

test('import clears incompatible undo and redo history', () => {
  mem.clear(); const source=new InvestigationStore(); source.loadDataset('model-regression'); const payload=source.exportState();
  const target=new InvestigationStore(); target.addFilter({field:'platform',op:'eq',value:'mobile'}); target.importState(payload);
  assert.equal(target.state.dataset.id,'model-regression');
  assert.equal(target.undo(),false);
  assert.equal(target.redo(),false);
});

test('canvas geometry is normalized at import and update boundaries', () => {
  mem.clear(); const s=new InvestigationStore(); const payload=s.exportState();
  payload.workspace.canvas.views[0].x='0px\" onfocus=\"globalThis.pwned=1';
  s.importState(payload);
  assert.equal(Number.isFinite(s.state.canvas.views[0].x),true);
  const before=s.state.canvas.views[0].x;
  s.updateCanvasView(s.state.canvas.views[0].id,{x:'bad\" onfocus=alert(1)'});
  assert.equal(s.state.canvas.views[0].x,before);
});

test('malformed persisted state recovers instead of bricking startup', () => {
  mem.clear(); mem.set('investigation-canvas-state-v1',JSON.stringify({datasetId:'checkout-regression',workspace:{filters:null,canvas:'bad'}}));
  const s=new InvestigationStore();
  assert.ok(Array.isArray(s.state.filters));
  assert.ok(Array.isArray(s.state.canvas.views));
  assert.ok(s.getVisibleRecords().length>0);
});

test('persistence failure is exposed in state', () => {
  mem.clear(); const original=global.localStorage.setItem; const s=new InvestigationStore();
  global.localStorage.setItem=()=>{throw new Error('quota exceeded')};
  s.setSearch('test');
  assert.equal(s.state.persistence.ok,false);
  assert.match(s.state.persistence.lastError,/quota exceeded/);
  global.localStorage.setItem=original;
});

test('undo preserves provenance and records the undo', () => {
  mem.clear(); const s=new InvestigationStore(); s.addFilter({field:'platform',op:'eq',value:'mobile'},'agent'); const revision=s.state.revision;
  const action=s.state.activity.find(entry=>entry.text.includes('filter'))?.text;
  s.undo();
  assert.ok(s.state.activity.some(entry=>entry.text===action));
  assert.ok(s.state.activity.some(entry=>entry.kind==='history'&&entry.text.startsWith('Undid')));
  assert.ok(s.state.revision>revision);
});

test('invalid references fail without recording false mutations', () => {
  mem.clear(); const s=new InvestigationStore(); const activity=s.state.activity.length;
  assert.equal(s.attachEvidence('missing','missing'),null);
  assert.equal(s.updateCanvasView('missing',{x:1}),null);
  assert.equal(s.removeCanvasView('missing'),false);
  assert.equal(s.focusCanvasView('missing'),false);
  assert.equal(s.linkCanvasViews('missing','also-missing'),null);
  assert.equal(s.addCausalLink({source:'missing',target:'also-missing'}),null);
  assert.equal(s.state.activity.length,activity);
});

test('confidence is clamped at creation boundaries', () => {
  mem.clear(); const s=new InvestigationStore();
  assert.equal(s.addHypothesis({title:'high',confidence:1000}).confidence,100);
  assert.equal(s.createFinding({title:'low',confidence:-4}).confidence,0);
});

test('import sanitizes nested branch snapshots and saved views', () => {
  mem.clear(); const s=new InvestigationStore(); const payload=s.exportState();
  payload.workspace.savedViews=[{id:'saved',name:'Saved',filters:[{field:'x',op:'wat'}],dimensions:{x:'latency'}}];
  payload.workspace.branches=[{id:'branch',name:'Branch',snapshot:{branches:[{id:'nested'}],filters:null}}];
  s.importState(payload);
  assert.equal(s.state.savedViews[0].filters[0].op,'eq');
  assert.equal(s.state.savedViews[0].dimensions.y,payload.dataset.dimensions.y);
  assert.equal(Object.hasOwn(s.state.branches[0].snapshot,'branches'),false);
});

test('annotations reject invalid target IDs', () => {
  mem.clear(); const s=new InvestigationStore();
  assert.equal(s.addAnnotation({targetType:'record',targetId:'missing-rec',text:'note'}), null);
  assert.equal(s.addAnnotation({targetType:'document',targetId:'missing-doc',text:'note'}), null);
  assert.equal(s.addAnnotation({targetType:'hypothesis',targetId:'missing-hyp',text:'note'}), null);
  assert.equal(s.addAnnotation({targetType:'graph-node',targetId:'missing-node',text:'note'}), null);
  assert.ok(s.addAnnotation({targetType:'workspace',text:'valid note'}));
});

test('canvas views validate evidence IDs and link constraints', () => {
  mem.clear(); const s=new InvestigationStore();
  assert.equal(s.addCanvasView({type:'evidence',evidenceId:'non-existent'}), null);
  const viewId = s.state.canvas.views[0].id;
  assert.equal(s.updateCanvasView(viewId, {evidenceId:'non-existent'}), null);
  assert.equal(s.linkCanvasViews(viewId, viewId), null);
});

test('sanitizeWorkspace prunes dangling causal links and invalid graph node focus', () => {
  mem.clear(); const s=new InvestigationStore(); const payload=s.exportState();
  payload.workspace.causalLinks=[{id:'bad-cause',source:'does-not-exist',target:'neither-does-this'}];
  payload.workspace.focusedGraphNodeId='missing-node';
  s.importState(payload);
  assert.equal(s.state.causalLinks.some(c=>c.id==='bad-cause'), false);
  assert.equal(s.state.focusedGraphNodeId, null);
});

test('workspace change tracking accurately detects changes', () => {
  mem.clear(); const fresh=new InvestigationStore();
  assert.equal(fresh.hasWorkspaceChanges(), false);
  fresh.setSelection([fresh.state.dataset.records[0].id]);
  assert.equal(fresh.hasWorkspaceChanges(), true);
});

test('getVisibleRecords caches by dataset identity and filters/search and invalidates on changes', () => {
  mem.clear();
  const s = new InvestigationStore();
  const v1 = s.getVisibleRecords();
  const v2 = s.getVisibleRecords();
  assert.equal(v1, v2);
  s.setSelection([s.state.dataset.records[0].id]);
  const v3 = s.getVisibleRecords();
  assert.equal(v3, v1);
  s.addFilter({ field: 'platform', op: 'eq', value: 'mobile' });
  const v4 = s.getVisibleRecords();
  assert.notEqual(v4, v1);
  assert.ok(v4.length < v1.length);
  s.setSearch('safari');
  const v5 = s.getVisibleRecords();
  assert.notEqual(v5, v4);
  s.undo();
  const v6 = s.getVisibleRecords();
  assert.equal(v6.length, v1.length);
  s.loadDataset('fraud-ring');
  const v7 = s.getVisibleRecords();
  assert.notEqual(v7, v1);
});

test('small custom datasets remain persistent and avoid repeated re-stringification on emit', () => {
  mem.clear();
  const smallDataset = {
    id: 'custom-small-1',
    title: 'Small Custom',
    records: [
      { id: 'r-1', metric: 10, group: 'alpha' },
      { id: 'r-2', metric: 20, group: 'beta' }
    ],
    provenance: { kind: 'file', label: 'small.csv', description: '2 records' }
  };
  const s = new InvestigationStore();
  s.loadCustomDataset(smallDataset);
  assert.equal(s.state.persistence.ok, true);
  assert.ok(mem.has('investigation-canvas-state-v1'));

  // Reload in new store verifies persistence of small custom datasets
  const reloaded = new InvestigationStore();
  assert.equal(reloaded.state.dataset.id, 'custom-small-1');
  assert.equal(reloaded.state.dataset.records.length, 2);
  assert.equal(reloaded.state.persistence.ok, true);

  // Verify custom dataset is not re-stringified on subsequent workspace emits
  let datasetStringified = 0;
  const originalStringify = JSON.stringify;
  JSON.stringify = function(val, ...args) {
    if (val?.id === 'custom-small-1') datasetStringified++;
    return originalStringify.call(this, val, ...args);
  };
  try {
    s.setSelection(['r-1']);
    s.setSearch('alpha');
    s.addFilter({ field: 'group', op: 'eq', value: 'alpha' });
    assert.equal(datasetStringified, 0);
    assert.equal(s.state.persistence.ok, true);
  } finally {
    JSON.stringify = originalStringify;
  }
});

test('large custom dataset imports are session-only with clear persistence warning', () => {
  mem.clear();
  const largeRecords = Array.from({ length: 1050 }, (_, i) => ({ id: `row-${i}`, val: i, cat: i % 2 === 0 ? 'even' : 'odd' }));
  const largeDataset = {
    id: 'custom-large-1',
    title: 'Large Custom',
    records: largeRecords,
    provenance: { kind: 'api', label: 'large.json', description: '1,050 records' }
  };
  const s = new InvestigationStore();
  s.loadCustomDataset(largeDataset);
  assert.equal(s.state.persistence.ok, false);
  assert.match(s.state.persistence.lastError, /session-only/i);
  assert.equal(mem.has('investigation-canvas-state-v1'), false);

  // Subsequent state changes do not persist and maintain clear warning
  s.setSearch('even');
  assert.equal(s.state.persistence.ok, false);
  assert.match(s.state.persistence.lastError, /session-only/i);
  assert.equal(mem.has('investigation-canvas-state-v1'), false);
  assert.ok(s.getVisibleRecords().length > 0);
});

test('custom dataset exceeding 250KB payload skips persistent storage with warning', () => {
  mem.clear();
  const bigPayloadRecords = Array.from({ length: 40 }, (_, i) => ({
    id: `row-${i}`,
    payload: 'x'.repeat(7000)
  }));
  const dataset = {
    id: 'custom-heavy',
    records: bigPayloadRecords
  };
  const s = new InvestigationStore();
  s.loadCustomDataset(dataset);
  assert.equal(s.state.persistence.ok, false);
  assert.match(s.state.persistence.lastError, /session-only/i);
  assert.equal(mem.has('investigation-canvas-state-v1'), false);
});
test('dataset provenance is sanitized to a small safe shape', () => {
  mem.clear();
  const unsafeDataset = {
    id: 'custom-unsafe',
    records: [{ id: 'u-1', name: 'item' }],
    provenance: {
      kind: 'x'.repeat(200),
      label: 'y'.repeat(500),
      description: 'z'.repeat(1000),
      untrustedToken: 'secret_token_123',
      sourceUrl: 'https://example.com/source'
    }
  };
  const s = new InvestigationStore();
  s.loadCustomDataset(unsafeDataset);
  const prov = s.state.dataset.provenance;
  assert.ok(prov.kind.length <= 40);
  assert.ok(prov.label.length <= 100);
  assert.ok(prov.description.length <= 300);
  assert.equal(prov.untrustedToken, undefined);
  assert.equal(prov.sourceUrl, 'https://example.com/source');
});
