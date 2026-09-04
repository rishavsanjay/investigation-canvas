import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './testStorage.js';
import { InvestigationStore } from '../src/store.js';
import { SAMPLE_DATASETS } from '../src/sampleData.js';
import { buildReasoningGraph, evidenceTerms, findCounterevidence, rankCategoricalConcentration } from '../src/core.js';
import { createWebMcpTools } from '../src/webmcp.js';

const fresh = (datasetId='checkout-regression') => { memoryStorage.clear(); const s=new InvestigationStore(); s.loadDataset(datasetId); return s; };

// 1–20: enhanced state/store behavior
test('01 canvas state exists',()=>assert.ok(fresh().state.canvas));
test('02 default canvas has at least eight views',()=>assert.ok(fresh().state.canvas.views.length>=8));
test('03 agent can create a canvas view',()=>{const s=fresh();const v=s.addCanvasView({type:'summary',title:'Agent lead'},'agent');assert.equal(v.agentCreated,true);});
test('04 canvas view can move',()=>{const s=fresh();const id=s.state.canvas.views[0].id;s.updateCanvasView(id,{x:444,y:222});assert.equal(s.state.canvas.views[0].x,444);});
test('05 canvas view can resize',()=>{const s=fresh();const id=s.state.canvas.views[0].id;s.updateCanvasView(id,{w:777,h:555});assert.equal(s.state.canvas.views[0].w,777);});
test('06 exact view can be focused',()=>{const s=fresh();const id=s.state.canvas.views[3].id;s.focusCanvasView(id);assert.equal(s.state.canvas.focusedViewId,id);});
test('07 focus layout enlarges focused view not first view',()=>{const s=fresh();const id=s.state.canvas.views[3].id;s.focusCanvasView(id);s.arrangeCanvas('focus');const f=s.state.canvas.views.find(v=>v.id===id);assert.equal(f.w,930);assert.notEqual(s.state.canvas.views[0].w,930);});
test('08 canvas views can be linked',()=>{const s=fresh();const [a,b]=s.state.canvas.views;const l=s.linkCanvasViews(a.id,b.id,'explains');assert.equal(s.state.canvas.links[0].label,'explains');assert.ok(l.id);});
test('09 removing view removes attached links',()=>{const s=fresh();const [a,b]=s.state.canvas.views;s.linkCanvasViews(a.id,b.id);s.removeCanvasView(a.id);assert.equal(s.state.canvas.links.length,0);});
test('10 finding persists',()=>{const s=fresh();const f=s.createFinding({title:'Observed',text:'Evidence',confidence:77});assert.equal(s.state.findings[0].id,f.id);});
test('11 causal link persists',()=>{const s=fresh();const [a,b]=s.state.dataset.graph.nodes;s.addCausalLink({source:a.id,target:b.id,label:'causes'});assert.equal(s.state.causalLinks.at(-1).label,'causes');});
test('12 hypothesis can fork',()=>{const s=fresh();const p=s.state.hypotheses[0];const f=s.forkHypothesis(p.id,{title:'Alternative'});assert.equal(f.parentId,p.id);});
test('13 counterevidence discovery returns ranked objects',()=>{const s=fresh();const h=s.state.hypotheses[0];const hits=s.discoverCounterevidence(h.id);assert.ok(Array.isArray(hits));});
test('14 reasoning graph includes hypotheses',()=>{const s=fresh();const g=buildReasoningGraph(s.state.hypotheses,s.state.dataset.documents,s.state.findings,s.state.causalLinks);assert.ok(g.nodes.some(n=>n.type==='hypothesis'));});
test('15 categorical concentration ranks fields',()=>{const s=fresh();const r=rankCategoricalConcentration(s.state.dataset.records,s.state.dataset.keyFields);assert.ok(r.length>0&&r[0].share>=0);});
test('16 evidence tokenizer handles punctuation safely',()=>assert.deepEqual(evidenceTerms('Safari 20.2 + web-4.7.2 failed'),['safari','20.2','web-4.7.2','failed']));
test('17 export contains canvas state',()=>assert.ok(fresh().exportState().workspace.canvas));
test('18 import restores canvas state',()=>{const s=fresh();s.focusCanvasView('view-graph');const p=s.exportState();const t=fresh();t.importState(p);assert.equal(t.state.canvas.focusedViewId,'view-graph');});
test('19 saved view captures canvas',()=>{const s=fresh();const v=s.saveView('with canvas');assert.ok(v.canvas);});
test('20 restored view restores canvas focus',()=>{const s=fresh();s.focusCanvasView('view-graph');const v=s.saveView('x');s.focusCanvasView('view-scatter');s.restoreView(v.id);assert.equal(s.state.canvas.focusedViewId,'view-graph');});

// 21–29: every demo has all rich evidence types
for (const [i,dataset] of SAMPLE_DATASETS.entries()) {
  for (const [j,type] of ['image','map','log'].entries()) {
    test(`${21+i*3+j} ${dataset.id} includes ${type} evidence`,()=>assert.ok(dataset.documents.some(d=>d.mediaType===type)));
  }
}

const tools = createWebMcpTools(fresh());
const byName = (name) => tools.find(t=>t.name===name);
// 30–35: tool catalog
test('30 enhanced WebMCP catalog reaches 48 tools',()=>assert.ok(tools.length>=48));
test('31 WebMCP tool names remain unique',()=>assert.equal(new Set(tools.map(t=>t.name)).size,tools.length));
test('32 create_canvas_view tool exists',()=>assert.ok(byName('create_canvas_view')));
test('33 fork_hypothesis tool exists',()=>assert.ok(byName('fork_hypothesis')));
test('34 find_counterevidence is read only',()=>assert.equal(byName('find_counterevidence').annotations.readOnlyHint,true));
test('35 rich evidence output is marked untrusted',()=>assert.equal(byName('list_rich_evidence').annotations.untrustedContentHint,true));

// 36–43: execute representative WebMCP paths
test('36 describe_workspace exposes canvas',async()=>{const s=fresh();const t=createWebMcpTools(s).find(x=>x.name==='describe_workspace');const out=await t.execute({});assert.ok(out.canvas.views.length);});
test('37 get_canvas_state executes',async()=>{const s=fresh();const out=await createWebMcpTools(s).find(x=>x.name==='get_canvas_state').execute({});assert.ok(out.canvas.views.length);});
test('38 create_canvas_view mutates shared state',async()=>{const s=fresh();const n=s.state.canvas.views.length;await createWebMcpTools(s).find(x=>x.name==='create_canvas_view').execute({type:'summary',title:'Agent summary'});assert.equal(s.state.canvas.views.length,n+1);});
test('39 link_canvas_views executes',async()=>{const s=fresh();const [a,b]=s.state.canvas.views;await createWebMcpTools(s).find(x=>x.name==='link_canvas_views').execute({sourceViewId:a.id,targetViewId:b.id,label:'supports'});assert.ok(s.state.canvas.links.length);});
test('40 create_finding executes',async()=>{const s=fresh();const n=s.state.findings.length;await createWebMcpTools(s).find(x=>x.name==='create_finding').execute({title:'Agent finding',text:'Observed pattern',confidence:70,evidenceIds:[]});assert.equal(s.state.findings.length,n+1);});
test('41 add_causal_link executes',async()=>{const s=fresh();const n=s.state.causalLinks.length;const [a,b]=s.state.dataset.graph.nodes;await createWebMcpTools(s).find(x=>x.name==='add_causal_link').execute({source:a.id,target:b.id,label:'causes',confidence:60});assert.equal(s.state.causalLinks.length,n+1);});
test('42 fork_hypothesis executes',async()=>{const s=fresh();const p=s.state.hypotheses[0];const n=s.state.hypotheses.length;await createWebMcpTools(s).find(x=>x.name==='fork_hypothesis').execute({parentId:p.id,title:'Tool fork'});assert.equal(s.state.hypotheses.length,n+1);});
test('43 arrange_canvas focus respects current focus',async()=>{const s=fresh();s.focusCanvasView('view-graph');await createWebMcpTools(s).find(x=>x.name==='arrange_canvas').execute({mode:'focus'});assert.equal(s.state.canvas.views.find(v=>v.id==='view-graph').w,930);});
