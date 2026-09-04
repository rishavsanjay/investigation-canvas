import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage as mem } from './testStorage.js';
const { InvestigationStore } = await import('../src/store.js');
const {
  runDemoScenario,
  updateDemoOverlay,
  createDemoOverlay,
  TOOL_GROUPS,
  formatSemanticInput,
  isDemoPaused,
  setDemoPaused,
  toggleDemoPause
} = await import('../src/demo.js');
const { createWebMcpTools } = await import('../src/webmcp.js');

function setup() {
  mem.clear();
  const store = new InvestigationStore();
  return { store };
}

test('runDemoScenario completes successfully with fast speed', async () => {
  const { store } = setup();

  // Run demo scenario with high speed (for fast test execution)
  const result = await runDemoScenario(store, { speed: 1000, overlay: null });
  assert.equal(result.ok, true);

  // Verifications:
  // 1. Dataset reset to checkout-regression
  assert.equal(store.state.dataset.id, 'checkout-regression');

  // 2. Hypotheses were updated
  const clientHyp = store.state.hypotheses.find((h) => h.id === 'hyp-client');
  const paymentHyp = store.state.hypotheses.find((h) => h.id === 'hyp-payment');
  assert.ok(clientHyp);
  assert.ok(paymentHyp);
  assert.equal(clientHyp.status, 'supported');
  assert.ok(clientHyp.confidence >= 80);
  assert.equal(paymentHyp.status, 'weakened');
  assert.ok(paymentHyp.confidence <= 20);

  // 3. Evidence attached to hypotheses
  assert.ok(clientHyp.supporting.includes('doc-release-472'));
  assert.ok(clientHyp.supporting.includes('doc-support-safari'));
  assert.ok(paymentHyp.contradicting.includes('doc-incident-payment'));

  // 4. Finding created for Safari loop
  const safariFinding = store.state.findings.find((f) => /Safari 20\.2/i.test(f.title));
  assert.ok(safariFinding);
  assert.ok(safariFinding.evidenceIds.includes('doc-release-472'));

  // 5. Canvas artifact created
  const canvasViews = store.state.canvas.views;
  const agentArtifact = canvasViews.find((v) => v.agentCreated && /Safari 20\.2/i.test(v.title));
  assert.ok(agentArtifact);

  // 6. Independent pricing hypothesis was forked from client hypothesis
  const pricingHyp = store.state.hypotheses.find((h) => h.parentId === clientHyp.id || /pricing experiment B/i.test(h.title));
  assert.ok(pricingHyp);
  assert.ok(pricingHyp.supporting.includes('doc-experiment-b'));

  // 7. Independent pricing finding created
  const pricingFinding = store.state.findings.find((f) => /price-test-B/i.test(f.title) || /pricing experiment/i.test(f.title));
  assert.ok(pricingFinding);
  assert.ok(pricingFinding.evidenceIds.includes('doc-experiment-b'));

  // 8. Finished on Provenance tab
  assert.equal(store.state.activeTab, 'provenance');

  // 9. Activity log contains both agent and human actions
  const humanActivity = store.state.activity.filter((a) => a.source === 'human');
  const agentActivity = store.state.activity.filter((a) => a.source === 'agent');
  assert.ok(humanActivity.length > 0, 'Must record human activity for challenge');
  assert.ok(store.state.activity.some((a) => a.text.includes('Agent called select_where')));
  assert.ok(store.state.activity.some((a) => a.text.includes('Agent called update_hypothesis')));
  assert.ok(store.state.activity.some((a) => a.text.includes('Agent called attach_evidence_to_hypothesis')));
  assert.ok(store.state.activity.some((a) => a.text.includes('Agent called create_finding')));
  assert.ok(store.state.activity.some((a) => a.text.includes('Agent called fork_hypothesis')));
  assert.ok(store.state.activity.some((a) => a.text.includes('Agent called create_canvas_view')));
});

test('overlay renders actors and details without a scripted-demo badge', () => {
  // Mock element for node test environment
  const mockOverlay = {
    innerHTML: ''
  };

  updateDemoOverlay(mockOverlay, {
    actor: 'AGENT',
    step: '2 / 8',
    title: 'Selecting suspicious cohort',
    detail: 'Calling select_where',
    tool: 'select_where',
    toolInput: { filters: [{ field: 'platform', op: 'eq', value: 'mobile' }] }
  });
  assert.ok(!mockOverlay.innerHTML.includes('SCRIPTED DEMO'));
  assert.ok(mockOverlay.innerHTML.includes('WebMCP Agent'));
  assert.ok(mockOverlay.innerHTML.includes('RUNNING TOOL'));
  assert.ok(mockOverlay.innerHTML.includes('select_where'));
  assert.ok(mockOverlay.innerHTML.includes('AGENT'));
  assert.ok(mockOverlay.innerHTML.includes('demo-actor agent'));
  assert.ok(mockOverlay.innerHTML.includes('Selecting suspicious cohort'));

  updateDemoOverlay(mockOverlay, {
    actor: 'AGENT',
    step: '2 / 8',
    title: 'select_where completed',
    detail: 'Selected 24 records',
    tool: 'select_where',
    toolInput: { filters: [] },
    toolState: 'complete',
    toolResult: 'Selected 24 records'
  });
  assert.ok(mockOverlay.innerHTML.includes('COMPLETED'));
  assert.ok(mockOverlay.innerHTML.includes('demo-gar-label">Result:</span>'));
  assert.ok(mockOverlay.innerHTML.includes('Selected 24 records'));

  updateDemoOverlay(mockOverlay, {
    actor: 'HUMAN CHALLENGE',
    step: '6 / 8',
    title: 'Human challenges agent explanation',
    detail: 'Selected desktop points'
  });
  assert.ok(!mockOverlay.innerHTML.includes('SCRIPTED DEMO'));
  assert.ok(mockOverlay.innerHTML.includes('HUMAN CHALLENGE'));
  assert.ok(mockOverlay.innerHTML.includes('demo-actor human'));
  assert.ok(mockOverlay.innerHTML.includes('Human challenges agent explanation'));
});

test('delay respects speed factor', async () => {
  const { delay } = await import('../src/demo.js');
  const start = Date.now();
  await delay(100, 10); // 100ms / 10 = 10ms
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 50, `Elapsed ${elapsed}ms should be fast with speed 10`);
});

test('human challenge selects exact desktop price-test-B web-4.7.2 records', async () => {
  const { store } = setup();
  store.loadDataset('checkout-regression');
  const { filterRecords } = await import('../src/core.js');
  const records = filterRecords(store.state.dataset.records, [
    { field: 'platform', op: 'eq', value: 'desktop' },
    { field: 'cohort', op: 'eq', value: 'price-test-B' },
    { field: 'version', op: 'eq', value: 'web-4.7.2' }
  ]);
  assert.ok(records.length > 10, 'Should find desktop price-test-B web-4.7.2 cohort records');
  assert.ok(records.every((r) => r.platform === 'desktop' && r.cohort === 'price-test-B' && r.version === 'web-4.7.2'));
});

test('TOOL_GROUPS covers all 48 tools in 5 approved groups', () => {
  const { store } = setup();
  const allTools = createWebMcpTools(store);
  assert.equal(allTools.length, 48);

  const expectedGroupNames = [
    'Workspace & Selection',
    'Comparative Analytics',
    'Evidence, Graph & Trust',
    'Hypotheses & Causal Reasoning',
    'Canvas, Views & History'
  ];
  assert.deepEqual(TOOL_GROUPS.map((g) => g.name), expectedGroupNames);

  const totalCount = TOOL_GROUPS.reduce((sum, g) => sum + g.count, 0);
  assert.equal(totalCount, 48, 'Group counts must sum to 48');

  for (const group of TOOL_GROUPS) {
    assert.ok(group.representative.length > 0, `Group ${group.name} must have representative tools`);
    assert.ok(group.description.length > 0, `Group ${group.name} must have a description`);
    for (const toolName of group.representative) {
      assert.ok(allTools.some((t) => t.name === toolName), `Representative tool ${toolName} must exist in webmcp catalog`);
    }
  }
});

test('overlay renders as Demo conversation panel with Goal -> Action -> Result and Technical details', () => {
  const mockOverlay = {
    innerHTML: ''
  };

  updateDemoOverlay(mockOverlay, {
    actor: 'AGENT',
    step: '2 / 8',
    title: 'Selecting suspicious cohort',
    goal: 'Isolate mobile Safari 20.2 on web-4.7.2',
    detail: 'Calling select_where',
    tool: 'select_where',
    toolInput: { filters: [{ field: 'platform', op: 'eq', value: 'mobile' }] }
  });

  // Requirement 1 & 9: Clearly labeled Demo conversation, no ChatGPT logo/trademark/native claim, no SCRIPTED DEMO
  assert.ok(mockOverlay.innerHTML.includes('Demo conversation'));
  assert.ok(!mockOverlay.innerHTML.includes('ChatGPT'));
  assert.ok(!mockOverlay.innerHTML.includes('SCRIPTED DEMO'));

  // Requirement 8: Pause/Resume and Replay controls
  assert.ok(mockOverlay.innerHTML.includes('id="demo-pause-btn"'));
  assert.ok(mockOverlay.innerHTML.includes('id="demo-replay-btn"'));

  // Requirement 4: Legible as Goal -> Action -> Result with collapsed Technical details
  assert.ok(mockOverlay.innerHTML.includes('Goal:'));
  assert.ok(mockOverlay.innerHTML.includes('Action:'));
  assert.ok(mockOverlay.innerHTML.includes('Result:'));
  assert.ok(mockOverlay.innerHTML.includes('Technical details'));
  assert.ok(mockOverlay.innerHTML.includes('demo-tech-details'));

  // Semantic input formatting
  const semantic = formatSemanticInput('select_where', {
    filters: [{ field: 'platform', op: 'eq', value: 'mobile' }]
  });
  assert.equal(semantic, "platform = 'mobile'");
});

test('pause and resume controls toggle state correctly', () => {
  setDemoPaused(false);
  assert.equal(isDemoPaused(), false);

  toggleDemoPause();
  assert.equal(isDemoPaused(), true);

  setDemoPaused(false);
  assert.equal(isDemoPaused(), false);
});
