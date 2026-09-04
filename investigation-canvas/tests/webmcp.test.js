import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage as mem } from './testStorage.js';
const { InvestigationStore } = await import('../src/store.js');
const { createWebMcpTools } = await import('../src/webmcp.js');

function setup(){ mem.clear(); const store=new InvestigationStore(); const tools=createWebMcpTools(store); return {store,tools,byName:Object.fromEntries(tools.map(t=>[t.name,t]))}; }

test('exposes a broad WebMCP surface', () => { const {tools}=setup(); assert.ok(tools.length >= 20); });
test('all tools have schemas and annotations', () => { const {tools}=setup(); for(const t of tools){assert.ok(t.name&&t.description&&t.inputSchema&&t.annotations); assert.equal(typeof t.annotations.readOnlyHint,'boolean');} });
test('untrusted evidence tools are annotated', () => { const {byName}=setup(); assert.equal(byName.search_evidence.annotations.untrustedContentHint,true); assert.equal(byName.get_evidence.annotations.untrustedContentHint,true); });
test('describe_workspace returns shared state', async () => { const {byName}=setup(); const out=await byName.describe_workspace.execute({}); assert.ok(out.records.total>0); assert.ok(out.schema.numericFields.length); assert.ok(out.dataSource?.kind); });
test('agent set_selection visibly mutates store', async () => { const {store,byName}=setup(); const id=store.state.dataset.records[0].id; await byName.set_selection.execute({recordIds:[id]}); assert.deepEqual(store.state.selection,[id]); assert.ok(store.state.activity.some(a=>a.source==='agent')); });
test('compare selection works', async () => { const {store,byName}=setup(); await byName.set_selection.execute({recordIds:store.state.dataset.records.slice(0,20).map(r=>r.id)}); const out=await byName.compare_selection_to_rest.execute({}); assert.ok(out.numeric.length); });
test('agent can create and update hypothesis', async () => { const {store,byName}=setup(); const h=await byName.create_hypothesis.execute({title:'Agent hypothesis',confidence:55}); await byName.update_hypothesis.execute({hypothesisId:h.id,confidence:80,status:'supported'}); assert.equal(store.state.hypotheses.find(x=>x.id===h.id).confidence,80); });
test('agent can filter and clear workspace', async () => { const {store,byName}=setup(); await byName.add_filter.execute({field:'platform',op:'eq',value:'mobile'}); assert.equal(store.state.filters.length,1); await byName.clear_filters.execute({}); assert.equal(store.state.filters.length,0); });
test('read/write annotations are sane', () => { const {byName}=setup(); assert.equal(byName.list_records.annotations.readOnlyHint,true); assert.equal(byName.set_selection.annotations.readOnlyHint,false); });
test('tool names are unique and catalog is large', () => { const {tools}=setup(); assert.equal(new Set(tools.map(t=>t.name)).size,tools.length); assert.ok(tools.length>=35); });
test('select_where creates shared attention', async () => { const {store,byName}=setup(); const out=await byName.select_where.execute({filters:[{field:'browser',op:'eq',value:'Safari 20.2'},{field:'platform',op:'eq',value:'mobile'}]}); assert.ok(out.selected>10); assert.equal(store.state.selection.length,out.selected); });
test('compare_queries supports controlled analysis', async () => { const {byName}=setup(); const out=await byName.compare_queries.execute({groupAFilters:[{field:'platform',op:'eq',value:'mobile'}],groupBFilters:[{field:'platform',op:'eq',value:'desktop'}]}); assert.ok(out.groupASize>0&&out.groupBSize>0); assert.ok(out.comparison.numeric.length); });
test('focus evidence changes visible tab', async () => { const {store,byName}=setup(); const id=store.state.dataset.documents[0].id; await byName.focus_evidence.execute({evidenceId:id}); assert.equal(store.state.activeTab,'evidence'); assert.equal(store.state.focusedDocumentId,id); });
test('read-only tools do not mutate revision, activity, or persistence', async () => {
  const {store,byName}=setup(); const before={revision:store.state.revision,activity:store.state.activity.length,writes:mem.size};
  await byName.describe_workspace.execute({}); await byName.list_records.execute({}); await byName.get_canvas_state.execute({}); await byName.list_hypotheses.execute({}); await byName.get_activity_provenance.execute({});
  assert.deepEqual({revision:store.state.revision,activity:store.state.activity.length,writes:mem.size},before);
});
test('write tools emit once while preserving tool and domain provenance', async () => {
  const {store,byName}=setup(); const revision=store.state.revision; const id=store.state.dataset.records[0].id;
  await byName.set_selection.execute({recordIds:[id]});
  assert.equal(store.state.revision,revision+1);
  assert.ok(store.state.activity.some(entry=>entry.text==='Agent called set_selection'));
  assert.ok(store.state.activity.some(entry=>entry.text.includes('Agent selected')));
});
test('compare query operators are constrained by schema', () => {
  const {byName}=setup();
  const operators=byName.compare_queries.inputSchema.properties.groupAFilters.items.properties.op.enum;
  assert.deepEqual(operators,['eq','neq','contains','gt','gte','lt','lte','between','in']);
});
test('invalid focus and mutation IDs reject instead of reporting success', async () => {
  const {byName}=setup();
  await assert.rejects(()=>byName.focus_record.execute({recordId:'missing'}),/Unknown record/);
  await assert.rejects(()=>byName.focus_evidence.execute({evidenceId:'missing'}),/Unknown evidence/);
  await assert.rejects(()=>byName.update_canvas_view.execute({viewId:'missing',x:1}),/Unknown canvas view/);
  await assert.rejects(()=>byName.remove_canvas_view.execute({viewId:'missing'}),/Unknown canvas view/);
  await assert.rejects(()=>byName.link_canvas_views.execute({sourceViewId:'missing',targetViewId:'also-missing'}),/Unknown canvas view/);
});
test('annotate_workspace rejects invalid target IDs', async () => {
  const {byName}=setup();
  await assert.rejects(()=>byName.annotate_workspace.execute({targetType:'record',targetId:'missing-rec',text:'note'}),/Unknown target ID/);
  await assert.rejects(()=>byName.annotate_workspace.execute({targetType:'document',targetId:'missing-doc',text:'note'}),/Unknown target ID/);
  await assert.rejects(()=>byName.annotate_workspace.execute({targetType:'hypothesis',targetId:'missing-hyp',text:'note'}),/Unknown target ID/);
});
test('canvas tools reject invalid evidence IDs and self links', async () => {
  const {store,byName}=setup();
  await assert.rejects(()=>byName.create_canvas_view.execute({type:'evidence',title:'View',evidenceId:'non-existent'}),/Invalid canvas view/);
  const viewId=store.state.canvas.views[0].id;
  await assert.rejects(()=>byName.update_canvas_view.execute({viewId,evidenceId:'non-existent'}),/invalid evidence ID/);
  await assert.rejects(()=>byName.link_canvas_views.execute({sourceViewId:viewId,targetViewId:viewId}),/Unknown canvas view/);
});
test('add_causal_link and add_filter reject invalid parameters', async () => {
  const {byName}=setup();
  await assert.rejects(()=>byName.add_causal_link.execute({source:'missing-src',target:'missing-dst'}),/Unknown causal-link endpoint/);
  await assert.rejects(()=>byName.add_filter.execute({field:'platform',op:'invalid-op',value:'mobile'}),/Invalid filter field or operator/);
});
