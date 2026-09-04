import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage as mem } from './testStorage.js';

const { InvestigationStore, STORAGE_KEY, DEMO_STORAGE_KEY } = await import('../src/store.js');
const {
  COMPREHENSIVE_PROMPT,
  HANDOFF_COPY,
  EXAMPLE_PACKS,
  capturePreExampleSnapshot,
  restorePreExampleSnapshot,
  getWebMcpStatus,
  getLiveProgress,
  getActiveSession,
  setActiveSession,
  startExamplePack,
  switchExamplePack,
  exitExample,
  renderExampleChooserModal,
  renderMissionRail
} = await import('../src/exampleWorkflow.js');
const { createWebMcpTools } = await import('../src/webmcp.js');

function setup() {
  mem.clear();
  const store = new InvestigationStore();
  setActiveSession(null);
  return { store };
}

test('normal workspace has no mounted example UI by default', () => {
  const { store } = setup();
  assert.equal(getActiveSession(), null);
  const railHtml = renderMissionRail(store);
  assert.equal(railHtml, '');
});

test('3 deterministic example packs exist with accurate shapes and checkout recommended', () => {
  assert.equal(EXAMPLE_PACKS.length, 3);
  const [checkout, model, fraud] = EXAMPLE_PACKS;

  assert.equal(checkout.id, 'checkout');
  assert.equal(checkout.recommended, true);
  assert.equal(checkout.dataShape.records, 720);
  assert.equal(checkout.dataShape.documents, 8);
  assert.equal(checkout.dataShape.graphNodes, 10);
  assert.ok(checkout.mission.includes('Safari 20.2'));
  assert.ok(checkout.valueSentence.length > 20);
  assert.equal(checkout.starterQuestions.length, 3);

  assert.equal(model.id, 'model');
  assert.equal(model.recommended, false);
  assert.equal(model.dataShape.records, 420);
  assert.equal(model.dataShape.documents, 6);
  assert.equal(model.dataShape.graphNodes, 6);
  assert.ok(model.starterQuestions.length, 3);

  assert.equal(fraud.id, 'fraud');
  assert.equal(fraud.recommended, false);
  assert.equal(fraud.dataShape.records, 560);
  assert.equal(fraud.dataShape.documents, 6);
  assert.equal(fraud.dataShape.graphNodes, 6);
  assert.ok(fraud.starterQuestions.length, 3);
});

test('comprehensive prompt covers all required investigation capabilities in natural language', () => {
  const p = COMPREHENSIVE_PROMPT;

  // 1. dataset/schema baseline
  assert.match(p, /dataset.*schema.*baseline/i);

  // 2. search/query/filter + shared selection
  assert.match(p, /search.*filter/i);
  assert.match(p, /shared.*selection/i);

  // 3. selection/rest and explicit cohort comparisons
  assert.match(p, /compare.*selection to the rest/i);
  assert.match(p, /compare explicit cohorts/i);

  // 4. discriminating features, correlations, outliers
  assert.match(p, /discriminating features/i);
  assert.match(p, /correlations/i);
  assert.match(p, /outliers/i);

  // 5. evidence/trust/focus, graph, counterevidence
  assert.match(p, /evidence.*trust/i);
  assert.match(p, /focus/i);
  assert.match(p, /graph/i);
  assert.match(p, /counterevidence/i);

  // 6. competing hypotheses/confidence/status/fork/supporting+contradicting evidence/falsification
  assert.match(p, /competing hypotheses/i);
  assert.match(p, /confidence.*status/i);
  assert.match(p, /fork/i);
  assert.match(p, /supporting.*contradicting/i);
  assert.match(p, /falsification/i);

  // 7. findings+causal links
  assert.match(p, /findings.*causal links/i);

  // 8. create/focus/arrange/link canvas views + annotation
  assert.match(p, /canvas views/i);
  assert.match(p, /annotation/i);

  // 9. saved view + reversible branch
  assert.match(p, /saved?.*view/i);
  assert.match(p, /branch/i);

  // 10. provenance & evidence-vs-inference conclusion
  assert.match(p, /provenance/i);
  assert.match(p, /verified evidence.*inferential conclusions/i);

  // Natural language, no raw tool names like create_canvas_view or select_where
  assert.doesNotMatch(p, /select_where/);
  assert.doesNotMatch(p, /create_canvas_view/);
  assert.doesNotMatch(p, /add_causal_link/);
  assert.doesNotMatch(p, /fork_hypothesis/);
});

test('handoff copy clearly specifies ChatGPT in-app browser and Chrome WebMCP instructions', () => {
  assert.match(HANDOFF_COPY, /ChatGPT's in-app browser/i);
  assert.match(HANDOFF_COPY, /Chrome with WebMCP enabled/i);
  assert.match(HANDOFF_COPY, /copies.*does not send/i);
});

test('startExamplePack isolates session and executes zero automatic agent actions', () => {
  const { store } = setup();

  // Verify baseline state before starting
  const initialRevision = store.state.revision;
  const initialActivityCount = store.state.activity.length;

  // Start checkout example pack
  const session = startExamplePack(store, 'checkout');
  assert.ok(session);
  assert.equal(session.pack.id, 'checkout');
  assert.equal(store._isolated, true);
  assert.equal(store._storageKey, DEMO_STORAGE_KEY);
  assert.equal(store.state.dataset.id, 'checkout-regression');

  // Verify zero automatic agent actions or simulated tool calls were executed
  assert.ok(!store.state.activity.some((a) => a.source === 'agent'));
  assert.equal(store.state.findings.length, store.state.dataset.starterFindings.length);
  assert.equal(store.state.hypotheses.length, store.state.dataset.starterHypotheses.length);
});

test('switching packs resets isolated example state while preserving original snapshot', () => {
  const { store } = setup();

  // User had a customized normal workspace
  store.setSearch('normal-search');
  assert.equal(store.state.search, 'normal-search');

  // Enter checkout pack
  startExamplePack(store, 'checkout');
  assert.equal(store.state.dataset.id, 'checkout-regression');

  // Mutate state during checkout example
  store.setSearch('safari-query');
  store.addHypothesis({ title: 'Isolated test hypothesis' }, 'agent');
  assert.equal(store.state.search, 'safari-query');

  // Switch to model pack
  const nextSession = switchExamplePack(store, 'model');
  assert.equal(nextSession.pack.id, 'model');
  assert.equal(store.state.dataset.id, 'model-regression');

  // Isolated mutations from checkout pack were reset
  assert.equal(store.state.search, '');
  assert.ok(!store.state.hypotheses.some((h) => h.title === 'Isolated test hypothesis'));

  // Original snapshot still preserves user's normal search
  assert.equal(nextSession.snapshot.state.search, 'normal-search');
});

test('exitExample cleanly restores exact in-memory state and byte-identical normal localStorage', () => {
  const { store } = setup();

  // Set up specific state in normal workspace
  store.setSearch('user-normal-query');
  store.setSelection(['req-0001', 'req-0002']);
  store.persist();

  const originalRawStorage = localStorage.getItem(STORAGE_KEY);
  assert.ok(originalRawStorage);
  const originalRevision = store.state.revision;
  const originalSearch = store.state.search;

  // Start example pack
  startExamplePack(store, 'checkout');

  // Mutate workspace heavily in example session
  store.loadDataset('fraud-ring');
  store.setSearch('fraud-search');
  store.setSelection(['row-5', 'row-9']);
  store.createFinding({ title: 'Synthetic finding', evidenceIds: [] });
  store.persist();

  // Verify normal storage was untouched by example mutations
  assert.equal(localStorage.getItem(STORAGE_KEY), originalRawStorage);
  assert.ok(sessionStorage.getItem(DEMO_STORAGE_KEY));

  // Exit example
  exitExample(store);

  // Verify exact restoration
  assert.equal(getActiveSession(), null);
  assert.equal(store._isolated, false);
  assert.equal(store._storageKey, STORAGE_KEY);
  assert.equal(store.state.search, originalSearch);
  assert.deepEqual(store.state.selection, ['req-0001', 'req-0002']);
  assert.equal(localStorage.getItem(STORAGE_KEY), originalRawStorage);
  assert.equal(sessionStorage.getItem(DEMO_STORAGE_KEY), null);
});

test('live progress checklist is derived strictly from real store state and reactive mutations', () => {
  const { store } = setup();
  const session = startExamplePack(store, 'checkout');
  const pack = session.pack;
  const baseline = session.baseline;

  let checklist = getLiveProgress(store, pack, baseline);
  const datasetItem = checklist.find((i) => i.id === 'dataset');
  const cohortItem = checklist.find((i) => i.id === 'cohort');
  const hypothesisItem = checklist.find((i) => i.id === 'hypotheses');
  const artifactItem = checklist.find((i) => i.id === 'artifact');

  assert.equal(datasetItem.done, true);
  assert.equal(cohortItem.done, false);
  assert.equal(artifactItem.done, false);

  // Agent sets selection
  store.setSelection(['req-0001', 'req-0002'], 'agent');
  checklist = getLiveProgress(store, pack, baseline);
  assert.equal(checklist.find((i) => i.id === 'cohort').done, true);

  // Agent updates hypothesis
  store.updateHypothesis('hyp-client', { status: 'supported', confidence: 90 }, 'agent');
  checklist = getLiveProgress(store, pack, baseline);
  assert.equal(checklist.find((i) => i.id === 'hypotheses').done, true);

  // Agent creates finding
  store.createFinding({ title: 'Safari iOS regression', evidenceIds: ['doc-release-472'] }, 'agent');
  checklist = getLiveProgress(store, pack, baseline);
  assert.equal(checklist.find((i) => i.id === 'artifact').done, true);
  assert.equal(checklist.find((i) => i.id === 'provenance').done, true);
});

test('renderExampleChooserModal outputs accessible cards with starter questions and value sentences', () => {
  const html = renderExampleChooserModal();
  assert.ok(html.includes('Choose an example investigation'));
  assert.ok(html.includes('Recommended'));
  assert.ok(html.includes('Checkout conversion regression'));
  assert.ok(html.includes('Model quality regression'));
  assert.ok(html.includes('Suspicious transaction network'));
  assert.ok(html.includes('720 telemetry records'));
  assert.ok(html.includes('420 training runs'));
  assert.ok(html.includes('560 transactions'));
  assert.ok(html.includes('Why human + agent:'));
  assert.ok(html.includes('Starter questions:'));
});

test('renderMissionRail includes WebMCP status, concise prompt, comprehensive disclosure, and handoff copy', () => {
  const { store } = setup();
  startExamplePack(store, 'checkout');

  const rail = renderMissionRail(store);
  assert.ok(rail.includes('mission-rail'));
  assert.ok(rail.includes('Checkout conversion regression'));
  assert.ok(rail.includes('Agent Prompts'));
  assert.ok(rail.includes('Scenario prompt'));
  assert.ok(rail.includes('Showcase every capability'));
  assert.ok(rail.includes('Comprehensive prompt'));
  assert.ok(rail.includes('Human + Agent Collaboration'));
  assert.ok(rail.includes('Live Progress'));
  assert.ok(rail.includes(HANDOFF_COPY.replace(/'/g, '&#39;')));
});

test('WebMCP tool catalog registers all 48 tools with schema annotations', () => {
  const { store } = setup();
  const tools = createWebMcpTools(store);
  assert.equal(tools.length, 48);

  const names = new Set(tools.map((t) => t.name));
  assert.equal(names.size, 48);

  // Key required capabilities exist as registered tools
  assert.ok(names.has('describe_workspace'));
  assert.ok(names.has('select_where'));
  assert.ok(names.has('compare_selection_to_rest'));
  assert.ok(names.has('compare_queries'));
  assert.ok(names.has('rank_discriminating_features'));
  assert.ok(names.has('rank_correlations'));
  assert.ok(names.has('find_outliers'));
  assert.ok(names.has('find_counterevidence'));
  assert.ok(names.has('fork_hypothesis'));
  assert.ok(names.has('create_finding'));
  assert.ok(names.has('add_causal_link'));
  assert.ok(names.has('create_canvas_view'));
  assert.ok(names.has('arrange_canvas'));
  assert.ok(names.has('save_analysis_view'));
  assert.ok(names.has('branch_investigation'));

  // Read/write annotations exist
  for (const t of tools) {
    assert.ok(typeof t.annotations?.readOnlyHint === 'boolean');
    assert.ok(t.inputSchema);
  }
});
