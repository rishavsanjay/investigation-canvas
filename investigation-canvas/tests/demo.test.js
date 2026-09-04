import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage as mem } from './testStorage.js';
const { InvestigationStore } = await import('../src/store.js');
const {
  runDemoScenario,
  updateDemoOverlay,
  createDemoOverlay,
  TOOL_GROUPS,
  HUMAN_OUTCOMES,
  summarizeToolResult,
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

test('overlay renders one readable activity state without a scripted-demo badge', () => {
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
  assert.ok(mockOverlay.innerHTML.includes('Human challenge'));
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

test('HUMAN_OUTCOMES covers 5 plain-language human outcomes with no tool pills', () => {
  assert.equal(HUMAN_OUTCOMES.length, 5);
  const expectedTitles = [
    'Understand the dataset',
    'Compare suspicious groups',
    'Inspect trusted evidence',
    'Test competing explanations',
    'Preserve findings and history'
  ];
  assert.deepEqual(HUMAN_OUTCOMES.map((o) => o.title), expectedTitles);

  for (const outcome of HUMAN_OUTCOMES) {
    assert.ok(outcome.description && outcome.description.length > 10, `Outcome ${outcome.title} must have descriptive sentence`);
  }

  const mockOverlay = { innerHTML: '' };
  updateDemoOverlay(mockOverlay, { isWalkthrough: true });
  assert.ok(mockOverlay.innerHTML.includes('demo-walkthrough-card'));
  assert.ok(mockOverlay.innerHTML.includes('Understand the dataset'));
  assert.ok(mockOverlay.innerHTML.includes('Compare suspicious groups'));
  assert.ok(mockOverlay.innerHTML.includes('Inspect trusted evidence'));
  assert.ok(mockOverlay.innerHTML.includes('Test competing explanations'));
  assert.ok(mockOverlay.innerHTML.includes('Preserve findings and history'));
  assert.ok(mockOverlay.innerHTML.includes('id="demo-show-catalog"'));
  assert.ok(mockOverlay.innerHTML.includes('View all 48 tools'));
  // No representative tool pills in capability onboarding
  assert.ok(!mockOverlay.innerHTML.includes('demo-tool-pill'));
});

test('domain-specific result summaries replace generic fallbacks', () => {
  const { store } = setup();
  store.loadDataset('checkout-regression');

  // 1. describe_workspace reports record, evidence, and hypothesis counts
  const wsResult = {
    records: { total: 520, visible: 520 },
    hypotheses: [{ id: 'h1' }, { id: 'h2' }],
    documents: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }]
  };
  const wsSummary = summarizeToolResult(wsResult, 'describe_workspace', {}, store);
  assert.ok(wsSummary.includes('520 records'));
  assert.ok(wsSummary.includes('3 evidence sources'));
  assert.ok(wsSummary.includes('2 hypotheses'));
  assert.ok(!wsSummary.includes('Returned records, hypotheses'));

  // 2. compare_selection_to_rest reports conversion and latency deltas
  const compResult = {
    count: 24,
    total: 520,
    numeric: [
      { field: 'conversion', delta: -18.4, meanA: 2.1, meanB: 20.5 },
      { field: 'latency', delta: 620.4, meanA: 1840, meanB: 1220 }
    ]
  };
  const compSummary = summarizeToolResult(compResult, 'compare_selection_to_rest', {}, store);
  assert.ok(compSummary.includes('conversion -18.40%'));
  assert.ok(compSummary.includes('latency +620ms'));
  assert.ok(!compSummary.includes('Returned numeric, categorical'));

  // 3. focus_evidence names the opened document
  const focusSummary = summarizeToolResult({ evidenceId: 'doc-release-472' }, 'focus_evidence', { evidenceId: 'doc-release-472' }, store);
  assert.ok(focusSummary.includes('Release web-4.7.2 notes'));
  assert.ok(focusSummary.includes('doc-release-472'));
  assert.ok(!focusSummary.includes('Returned evidenceId'));

  // 4. search_evidence reports matching evidence titles and count
  const searchResult = {
    documents: [
      { id: 'doc-release-472', title: 'Release 4.7.2 Notes' },
      { id: 'doc-support-safari', title: 'Support escalation: Safari' }
    ]
  };
  const searchSummary = summarizeToolResult(searchResult, 'search_evidence', { query: 'Safari' }, store);
  assert.ok(searchSummary.includes('Found 2 matching documents'));
  assert.ok(searchSummary.includes('Release 4.7.2 Notes'));
  assert.ok(!searchSummary.includes('Retrieved 0 findings'));

  // 5. select_where reports cohort size
  const selectSummary = summarizeToolResult({ selected: 24 }, 'select_where', { filters: [] }, store);
  assert.equal(selectSummary, 'Selected cohort: 24 records');

  // 6. hypothesis, finding, and canvas actions state what changed
  const clientHyp = store.state.hypotheses[0];
  const hypSummary = summarizeToolResult({}, 'update_hypothesis', { hypothesisId: clientHyp.id, status: 'supported', confidence: 85 }, store);
  assert.ok(hypSummary.includes('supported (85% confidence)'));
  assert.ok(hypSummary.includes(clientHyp.title));

  const attachSummary = summarizeToolResult({}, 'attach_evidence_to_hypothesis', { hypothesisId: clientHyp.id, evidenceId: 'doc-release-472', stance: 'supporting' }, store);
  assert.ok(attachSummary.includes('supporting evidence'));
  assert.ok(attachSummary.includes('Release web-4.7.2 notes'));
  const forkSummary = summarizeToolResult({ title: 'Desktop pricing experiment B', confidence: 80 }, 'fork_hypothesis', {}, store);
  assert.ok(forkSummary.includes('Forked hypothesis: "Desktop pricing experiment B" (80% confidence)'));

  const findSummary = summarizeToolResult({ title: 'Safari form loop', confidence: 88 }, 'create_finding', {}, store);
  assert.ok(findSummary.includes('Recorded finding: "Safari form loop" (88% confidence)'));

  const canvasSummary = summarizeToolResult({ title: 'Safari Summary' }, 'create_canvas_view', { type: 'summary', title: 'Safari Summary' }, store);
  assert.ok(canvasSummary.includes('Created summary canvas view: "Safari Summary"'));
});

test('transcript keeps max 4 narrative messages with no per-tool cards and single live activity in footer', () => {
  // Minimal DOM-like element node implementation for DOM-aware tests in node
  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      attributes: {},
      classList: new Set(),
      _html: '',
      setAttribute(name, val) { this.attributes[name] = String(val); },
      getAttribute(name) { return this.attributes[name] || null },
      appendChild(child) { this.children.push(child); return child; },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const results = [];
        const match = (node) => {
          let matched = false;
          if (sel.startsWith('#') && node.attributes.id === sel.slice(1)) matched = true;
          else if (sel.startsWith('.') && node.classList?.has(sel.slice(1))) matched = true;
          else if (sel === node.tagName?.toLowerCase()) matched = true;
          else if (node._html && sel === '.demo-step-card' && node._html.includes('demo-step-card')) matched = true;
          else if (node._html && sel === '.demo-narrative-msg' && node._html.includes('demo-narrative-msg')) matched = true;
          else if (node._html && sel === '.demo-tool-call' && node._html.includes('demo-tool-call')) matched = true;
          if (matched) results.push(node);
          for (const c of node.children || []) match(c);
        };
        match(this);
        return results;
      },
      get innerHTML() { return this._html; },
      set innerHTML(html) {
        this._html = html;
        // Parse basic child elements for querySelector
        this.children = [];
        if (html.includes('id="demo-messages"')) {
          const msgDiv = createElement('div');
          msgDiv.setAttribute('id', 'demo-messages');
          msgDiv.classList.add('demo-messages');
          msgDiv.insertAdjacentHTML = (pos, raw) => {
            msgDiv._html = (msgDiv._html || '') + raw;
          };
          msgDiv.querySelectorAll = (s) => {
            const items = [];
            if (s === '.demo-narrative-msg') {
              const matches = (msgDiv._html || '').match(/demo-narrative-msg/g);
              if (matches) for (let i = 0; i < matches.length; i++) items.push({ textContent: msgDiv._html });
            }
            if (s === '.demo-step-card') {
              const matches = (msgDiv._html || '').match(/demo-step-card/g);
              if (matches) for (let i = 0; i < matches.length; i++) items.push({ textContent: msgDiv._html });
            }
            return items;
          };
          this.children.push(msgDiv);
        }
        if (html.includes('demo-panel-footer')) {
          const footerDiv = createElement('div');
          footerDiv.classList.add('demo-panel-footer');
          this.children.push(footerDiv);
        }
      }
    };
    return el;
  }

  const overlay = createElement('aside');

  // 1. Walkthrough
  updateDemoOverlay(overlay, { isWalkthrough: true });

  // 2. Human request (narrative message 1)
  updateDemoOverlay(overlay, {
    actor: 'HUMAN',
    humanText: 'Conversion dropped this week. Investigate the cause.'
  });

  // 3. Tool 1 running & complete
  updateDemoOverlay(overlay, {
    actor: 'AGENT',
    step: '1 / 8',
    tool: 'describe_workspace',
    toolState: 'running'
  });
  updateDemoOverlay(overlay, {
    actor: 'AGENT',
    step: '1 / 8',
    tool: 'describe_workspace',
    toolState: 'complete',
    toolResult: 'Workspace ready: 520 records'
  });

  // 4. Tool 2 running & complete
  updateDemoOverlay(overlay, {
    actor: 'AGENT',
    step: '2 / 8',
    tool: 'select_where',
    toolState: 'complete',
    toolResult: 'Selected cohort: 24 records'
  });

  // 5. Agent interim synthesis (narrative message 2)
  updateDemoOverlay(overlay, {
    actor: 'AGENT',
    agentText: 'I investigated the conversion drop: mobile Safari 20.2 users experienced regressions.'
  });

  // 6. Human challenge (narrative message 3)
  updateDemoOverlay(overlay, {
    actor: 'HUMAN CHALLENGE',
    humanText: 'These desktop points don’t fit the Safari explanation.'
  });

  // 7. Tool 3 running & complete
  updateDemoOverlay(overlay, {
    actor: 'AGENT',
    step: '7 / 8',
    tool: 'fork_hypothesis',
    toolState: 'complete',
    toolResult: 'Forked hypothesis: Desktop pricing experiment B'
  });
  const footerEl = overlay.querySelector('.demo-panel-footer');
  assert.ok(footerEl, 'Footer must exist');
  const liveActivityHtml = footerEl.innerHTML;

  // 8. Agent final conclusion (narrative message 4)
  updateDemoOverlay(overlay, {
    actor: 'AGENT',
    agentText: 'Good catch. Isolating those desktop points reveals an independent regression.'
  });

  const messagesEl = overlay.querySelector('#demo-messages');
  assert.ok(messagesEl, 'Conversation container #demo-messages must exist');

  // Exactly 4 narrative messages max
  const narrativeMsgs = messagesEl.querySelectorAll('.demo-narrative-msg');
  assert.equal(narrativeMsgs.length, 4, 'Must have exactly 4 narrative messages');

  // Zero per-tool cards in transcript
  const stepCardsInTranscript = messagesEl.querySelectorAll('.demo-step-card');
  assert.equal(stepCardsInTranscript.length, 0, 'No per-tool step cards in transcript stream');

  // A tool state has one live activity component; narrative states do not
  // retain a stale completed call.
  assert.ok(liveActivityHtml.includes('demo-live-activity'), 'Live activity component must exist during a tool state');
  assert.ok(!footerEl.innerHTML.includes('demo-live-activity'), 'Narrative state must not duplicate the previous tool');
  assert.ok(footerEl.innerHTML.includes('id="demo-actions-summary"'), 'Completed actions summary must exist');
  assert.ok(footerEl.innerHTML.includes('investigation actions'), 'Completed actions label must exist');
  // Collapsed by default
  assert.ok(!footerEl.innerHTML.includes('<details class="demo-actions-summary" id="demo-actions-summary" open'), 'Actions summary must be collapsed by default');
});

test('normal workspace persisted state survives a demo run and exit', async () => {
  mem.clear();
  const customSavedState = JSON.stringify({
    datasetId: 'checkout-regression',
    customDataset: null,
    workspace: {
      filters: [{ id: 'custom-f1', field: 'platform', op: 'eq', value: 'desktop' }],
      selection: ['row-1', 'row-2'],
      hypotheses: [{ id: 'user-hyp-1', title: 'Custom user hypothesis', confidence: 75, status: 'testing' }],
      activeTab: 'hypotheses'
    }
  });

  global.localStorage.setItem('investigation-canvas-state-v1', customSavedState);

  const demoStore = new InvestigationStore();
  // Run demo scenario
  const demoResult = await runDemoScenario(demoStore, { speed: 1000, overlay: null });
  assert.equal(demoResult.ok, true);

  // Normal workspace localStorage must NOT be overwritten with completed demo state
  const afterDemoState = global.localStorage.getItem('investigation-canvas-state-v1');
  assert.equal(afterDemoState, customSavedState, 'Normal workspace localStorage must survive unchanged');

  // A fresh store instance in normal URL loads the pre-demo normal workspace
  const normalStore = new InvestigationStore();
  assert.equal(normalStore.state.activeTab, 'hypotheses', 'Normal store loads pre-demo active tab');
  assert.ok(normalStore.state.hypotheses.some((h) => h.id === 'user-hyp-1'), 'Normal store preserves user hypotheses');
});

test('normal URL has no demo panel mounted', () => {
  // Regular URL without ?demo=1 does not mount demo overlay
  if (typeof document !== 'undefined') {
    const existingOverlay = document.getElementById('demo-overlay');
    assert.equal(existingOverlay, null, 'Regular URL has no demo panel');
    assert.ok(!document.body.classList.contains('demo-mode'), 'Regular URL body does not have demo-mode');
  }
});
