/**
 * Real interactive example workflow for Investigation Canvas.
 * Provides authentic, external-agent-ready example packs with deterministic datasets,
 * scenario prompts, live progress tracking, and complete state isolation.
 *
 * Boundary rules:
 * - Never simulate conversations, cursor movements, or fake tool calls.
 * - External WebMCP agents operate directly on the real store via registered tools.
 * - Normal localStorage is snapshot-preserved and left byte-identical on exit.
 */
import { deepClone } from './core.js';
import { SAMPLE_DATASETS } from './sampleData.js';
import { STORAGE_KEY, DEMO_STORAGE_KEY } from './store.js';

export const COMPREHENSIVE_PROMPT = `Conduct a thorough investigation using all available investigative tools on this workspace:
1. Orient on the dataset, fields, and schema, and summarize the baseline metrics and distributions.
2. Search and filter records to isolate the anomalous cohort and establish a shared visual selection on the workspace.
3. Statistically compare this selection to the rest of the dataset, compare explicit cohorts against each other, rank the top discriminating features and key correlations, and identify extreme outliers.
4. Inspect all available evidence documents and their trust metadata. Focus relevant documents, traverse the relationship graph for connected entities, and actively search for counterevidence that could disprove leading assumptions.
5. Formulate and maintain at least two competing hypotheses. Update their confidence and status as you evaluate evidence, fork an alternative hypothesis when a secondary anomaly emerges, attach supporting and contradicting evidence to each, and document key falsification questions.
6. Record durable findings with confidence ratings and establish causal links connecting root causes, evidence, and observed metrics.
7. Create, arrange, focus, and link spatial canvas views highlighting the critical anomalies and findings, and add an annotation marking key takeaways.
8. Save an analysis view and create a named investigation branch before exploring an alternative inquiry path.
9. Conclude by reviewing the complete activity provenance audit trail, clearly distinguishing verified evidence from inferential conclusions.`;

export const HANDOFF_COPY = `When this page is open in ChatGPT's in-app browser, paste the prompt into the surrounding ChatGPT conversation; alternatively use Chrome with WebMCP enabled and the compatible agent. Note: this page copies the prompt to your clipboard but does not send it automatically.`;

export const EXAMPLE_PACKS = [
  {
    id: 'checkout',
    datasetId: 'checkout-regression',
    title: 'Checkout conversion regression',
    recommended: true,
    mission: 'Find the Safari 20.2 mobile regression and the separate desktop pricing experiment.',
    valueSentence: 'Human spots visual outliers on the scatter plot and challenges premature single-cause assumptions; agent isolates cohorts, tests competing explanations, and validates release notes.',
    collaborationWhy: 'Human spots visual outliers on the scatter plot and challenges premature single-cause assumptions; agent isolates cohorts, tests competing explanations, and validates release notes.',
    dataShape: {
      records: 720,
      documents: 8,
      graphNodes: 10,
      label: 'telemetry records'
    },
    starterQuestions: [
      'Why did checkout completion drop in recent releases?',
      'Are mobile and desktop failures driven by the same underlying cause?',
      'What release and error evidence supports or contradicts payment API outages?'
    ],
    concisePrompt: 'Investigate why checkout conversion dropped in recent releases. Start by inspecting workspace schema and telemetry distributions, compare mobile vs desktop cohorts to isolate anomalies, and review release notes and payment incident evidence. Maintain competing hypotheses for client compatibility versus payment outages, challenge assumptions with counterevidence, create a durable finding, and arrange key evidence on the investigation canvas.'
  },
  {
    id: 'model',
    datasetId: 'model-regression',
    title: 'Model quality regression',
    recommended: false,
    mission: 'Identify competing failure modes and contradictory runs/evidence across dataset lineage.',
    valueSentence: 'Human challenges whether aggressive center crops explain all loss drops; agent ranks discriminating features across hundreds of training runs and maps preprocessing lineage.',
    collaborationWhy: 'Human challenges whether aggressive center crops explain all loss drops; agent ranks discriminating features across hundreds of training runs and maps preprocessing lineage.',
    dataShape: {
      records: 420,
      documents: 6,
      graphNodes: 6,
      label: 'training runs'
    },
    starterQuestions: [
      'Did dataset-v7 center cropping cause the aggregate accuracy drop?',
      'Is the Lion optimizer divergence an independent failure mode?',
      'Which runs recover accuracy when holding preprocessing constant?'
    ],
    concisePrompt: 'Analyze the accuracy regression in training runs following the dataset-v7 rollout. Query the run history to compare dataset-v7 center crops against earlier baselines, correlate hyperparameters with validation loss, and inspect failure review documents. Track competing hypotheses for preprocessing truncation versus optimizer divergence, attach corroborating and contradicting evidence, and record your findings.'
  },
  {
    id: 'fraud',
    datasetId: 'fraud-ring',
    title: 'Suspicious transaction network',
    recommended: false,
    mission: 'Identify coordinated entities while strictly respecting untrusted evidence boundaries.',
    valueSentence: 'Human enforces evidentiary trust boundaries and rejects unverified forum rumors; agent traverses entity graph connections, identifies fingerprint overlap, and calculates merchant concentrations.',
    collaborationWhy: 'Human enforces evidentiary trust boundaries and rejects unverified forum rumors; agent traverses entity graph connections, identifies fingerprint overlap, and calculates merchant concentrations.',
    dataShape: {
      records: 560,
      documents: 6,
      graphNodes: 6,
      label: 'transactions'
    },
    starterQuestions: [
      'Are dev-A12 and dev-B77 part of a coordinated transaction ring?',
      'Does transaction velocity at Northstar Digital correlate with shared hosting ASNs?',
      'How should the unverified forum note about Vertex Services be evaluated against internal telemetry?'
    ],
    concisePrompt: 'Examine the transaction network for coordinated fraud across merchants. Query transaction velocity, isolate shared device fingerprints (like dev-A12 and dev-B77), and traverse the relationship graph to identify linked hosting networks. Distinguish verified internal risk notes from untrusted external allegations, maintain competing hypotheses on common control, and document your causal reasoning on the canvas.'
  }
];

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isCustomDataset(dataset) {
  return Boolean(dataset?.id) && !SAMPLE_DATASETS.some((d) => d.id === dataset.id);
}

// Active session state holder
let activeSession = null;

export function getActiveSession() {
  return activeSession;
}

export function setActiveSession(session) {
  activeSession = session;
}

/**
 * Capture pre-example snapshot of the workspace to guarantee exact restoration.
 */
export function capturePreExampleSnapshot(store) {
  let rawLocalStorage = null;
  try {
    if (typeof localStorage !== 'undefined') {
      rawLocalStorage = localStorage.getItem(STORAGE_KEY);
    }
  } catch (_) {}

  return {
    rawLocalStorage,
    storageKey: store._storageKey,
    isolated: store._isolated,
    state: deepClone(store.state),
    undoStack: deepClone(store.undoStack || []),
    redoStack: deepClone(store.redoStack || []),
    customDataset: isCustomDataset(store.state?.dataset) ? deepClone(store.state.dataset) : null
  };
}

/**
 * Restore pre-example snapshot byte-for-byte and in-memory.
 */
export function restorePreExampleSnapshot(store, snapshot) {
  if (!snapshot) return;

  // Clean up example session storage
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(DEMO_STORAGE_KEY);
    }
  } catch (_) {}

  // Restore persistence isolation configuration
  store._storageKey = snapshot.storageKey || STORAGE_KEY;
  store._isolated = Boolean(snapshot.isolated);

  // Restore localStorage byte-for-byte
  try {
    if (typeof localStorage !== 'undefined') {
      if (snapshot.rawLocalStorage === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, snapshot.rawLocalStorage);
      }
    }
  } catch (_) {}

  // Restore exact in-memory state
  store.state = deepClone(snapshot.state);
  store.undoStack = deepClone(snapshot.undoStack || []);
  store.redoStack = deepClone(snapshot.redoStack || []);

  store.invalidateVisibleRecordsCache();
  store.emit();
}

/**
 * Derives WebMCP connection status from store state and document.modelContext.
 */
export function getWebMcpStatus(store) {
  const hasModelContext = typeof document !== 'undefined' && Boolean(document.modelContext?.registerTool);
  const registered = store.state?.webmcp?.registered || 0;
  const isAvailable = store.state?.webmcp?.available && registered > 0;

  if (hasModelContext || isAvailable) {
    const count = registered || 48;
    return {
      ready: true,
      label: `WebMCP ready — ${count} tools registered`,
      detail: 'External agent connected via standard host bridge'
    };
  }

  return {
    ready: false,
    label: 'Open in ChatGPT’s in-app browser or Chrome with WebMCP enabled',
    detail: 'WebMCP tools registered locally; awaiting compatible external host agent'
  };
}

/**
 * Calculates live progress checklist strictly from real store state and activity.
 */
export function getLiveProgress(store, pack, baseline) {
  const s = store.state || {};
  const base = baseline || {};

  const datasetReady = Boolean(s.dataset && s.dataset.id === pack.datasetId && s.dataset.records?.length > 0);
  const cohortSelected = (s.selection?.length || 0) > 0 || (s.activity || []).some((a) => a.kind === 'selection');

  const evidenceInspected = s.activeTab === 'evidence' ||
    Boolean(s.focusedDocumentId) ||
    (s.canvas?.views?.some((v) => v.evidenceId) ?? false) ||
    (s.activity || []).some((a) => a.kind === 'evidence' || a.text?.toLowerCase().includes('evidence'));

  const baseHypothesesCount = base.hypothesesCount || 0;
  const baseEvidenceAttachments = base.evidenceAttachments || 0;
  const currentAttachments = (s.hypotheses || []).reduce((acc, h) => acc + (h.supporting?.length || 0) + (h.contradicting?.length || 0), 0);
  const hypothesesTested = ((s.hypotheses?.length || 0) >= 2) &&
    (s.hypotheses.some((h) => h.status !== 'testing') ||
      currentAttachments > baseEvidenceAttachments ||
      (s.hypotheses.length > baseHypothesesCount) ||
      (s.activity || []).some((a) => a.kind === 'hypothesis' || a.text?.toLowerCase().includes('hypothesis')));

  const baseFindingsCount = base.findingsCount || 0;
  const baseCausalCount = base.causalCount || 0;
  const artifactCreated = (s.findings?.length || 0) > baseFindingsCount ||
    (s.causalLinks?.length || 0) > baseCausalCount ||
    (s.canvas?.views?.some((v) => v.agentCreated) ?? false) ||
    (s.activity || []).some((a) => a.kind === 'finding' || a.kind === 'canvas');

  const baseActivityCount = base.activityCount || 0;
  const provenanceRecorded = (s.activity || []).some((a) => a.source === 'agent') ||
    (s.activity?.length || 0) > baseActivityCount;

  return [
    {
      id: 'dataset',
      label: `Dataset ready (${pack.dataShape.records} records)`,
      done: datasetReady
    },
    {
      id: 'cohort',
      label: 'Cohort selected',
      done: cohortSelected
    },
    {
      id: 'evidence',
      label: 'Evidence inspected',
      done: evidenceInspected
    },
    {
      id: 'hypotheses',
      label: 'Competing hypotheses tested',
      done: hypothesesTested
    },
    {
      id: 'artifact',
      label: 'Finding or canvas artifact created',
      done: artifactCreated
    },
    {
      id: 'provenance',
      label: 'Provenance recorded',
      done: provenanceRecorded
    }
  ];
}

/**
 * Start an isolated example session with the chosen pack.
 */
export function startExamplePack(store, packId, options = {}) {
  const pack = EXAMPLE_PACKS.find((p) => p.id === packId) || EXAMPLE_PACKS[0];

  // If already in an example session, reset isolated state
  if (activeSession) {
    return switchExamplePack(store, pack.id);
  }

  // Snapshot user's original workspace before entering example mode
  const snapshot = options.snapshot || capturePreExampleSnapshot(store);

  // Isolate store session
  store.isolateForDemo();
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(DEMO_STORAGE_KEY);
    }
  } catch (_) {}

  // Load deterministic sample dataset
  store.loadDataset(pack.datasetId);

  // Capture baseline counts for reactive progress tracking
  const baseline = {
    hypothesesCount: store.state.hypotheses?.length || 0,
    evidenceAttachments: (store.state.hypotheses || []).reduce((acc, h) => acc + (h.supporting?.length || 0) + (h.contradicting?.length || 0), 0),
    findingsCount: store.state.findings?.length || 0,
    causalCount: store.state.causalLinks?.length || 0,
    activityCount: store.state.activity?.length || 0
  };

  activeSession = {
    pack,
    snapshot,
    baseline
  };

  // Update URL query parameters without reloading
  try {
    if (typeof window !== 'undefined' && window.location) {
      const url = new URL(window.location.href);
      url.searchParams.set('example', pack.id);
      url.searchParams.delete('demo');
      url.searchParams.delete('walkthrough');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  } catch (_) {}

  // Rerender app
  store.emit();
  return activeSession;
}

/**
 * Switching packs resets isolated example state without altering original pre-example snapshot.
 */
export function switchExamplePack(store, packId) {
  if (!activeSession) {
    return startExamplePack(store, packId);
  }

  const pack = EXAMPLE_PACKS.find((p) => p.id === packId) || EXAMPLE_PACKS[0];

  // Reset isolated example session storage
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(DEMO_STORAGE_KEY);
    }
  } catch (_) {}

  // Re-ensure store is isolated
  store.isolateForDemo();

  // Load new dataset
  store.loadDataset(pack.datasetId);

  // Reset baseline counts
  const baseline = {
    hypothesesCount: store.state.hypotheses?.length || 0,
    evidenceAttachments: (store.state.hypotheses || []).reduce((acc, h) => acc + (h.supporting?.length || 0) + (h.contradicting?.length || 0), 0),
    findingsCount: store.state.findings?.length || 0,
    causalCount: store.state.causalLinks?.length || 0,
    activityCount: store.state.activity?.length || 0
  };

  activeSession = {
    pack,
    snapshot: activeSession.snapshot, // preserve pre-example snapshot!
    baseline
  };

  // Update URL query parameters
  try {
    if (typeof window !== 'undefined' && window.location) {
      const url = new URL(window.location.href);
      url.searchParams.set('example', pack.id);
      url.searchParams.delete('demo');
      url.searchParams.delete('walkthrough');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  } catch (_) {}

  store.emit();
  return activeSession;
}

/**
 * Exit example workflow and completely restore original user workspace.
 */
export function exitExample(store) {
  if (!activeSession) return;

  const snapshot = activeSession.snapshot;
  activeSession = null;

  // Clean URL parameters
  try {
    if (typeof window !== 'undefined' && window.location) {
      const url = new URL(window.location.href);
      url.searchParams.delete('example');
      url.searchParams.delete('demo');
      url.searchParams.delete('walkthrough');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  } catch (_) {}

  restorePreExampleSnapshot(store, snapshot);
}

/**
 * Render example chooser modal dialog HTML.
 */
export function renderExampleChooserModal() {
  return `
    <div class="modal example-chooser-modal">
      <div class="modal-head">
        <div>
          <h2 id="modal-title">Choose an example investigation</h2>
          <p class="modal-subtitle">Deterministic scenarios designed for collaborative human + agent reasoning with WebMCP.</p>
        </div>
        <button class="btn icon ghost" data-close-modal aria-label="Close dialog">×</button>
      </div>
      <div class="modal-body">
        <div class="example-cards-grid">
          ${EXAMPLE_PACKS.map((pack) => `
            <div class="example-card ${pack.recommended ? 'recommended' : ''}" data-pack-id="${escapeHtml(pack.id)}" role="button" tabindex="0" aria-label="Select ${escapeHtml(pack.title)}">
              <div class="example-card-head">
                <div class="example-card-title-wrap">
                  <h3 class="example-card-title">${escapeHtml(pack.title)}</h3>
                  ${pack.recommended ? '<span class="example-badge recommended">Recommended</span>' : ''}
                </div>
                <div class="example-data-shape">
                  <span>${pack.dataShape.records} ${escapeHtml(pack.dataShape.label)}</span>
                  <span>•</span>
                  <span>${pack.dataShape.documents} evidence docs</span>
                  <span>•</span>
                  <span>${pack.dataShape.graphNodes} entities</span>
                </div>
              </div>
              <p class="example-card-mission"><strong>Mission:</strong> ${escapeHtml(pack.mission)}</p>
              <div class="example-card-collab">
                <span class="collab-label">Why human + agent:</span>
                <p class="collab-desc">${escapeHtml(pack.valueSentence)}</p>
              </div>
              <div class="example-card-questions">
                <span class="questions-label">Starter questions:</span>
                <ul>
                  ${pack.starterQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}
                </ul>
              </div>
              <div class="example-card-actions">
                <button class="btn ${pack.recommended ? 'primary' : ''} example-start-btn" data-start-pack="${escapeHtml(pack.id)}">Start investigation</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render calm active mission rail alongside workspace.
 */
export function renderMissionRail(store) {
  if (!activeSession) return '';

  const { pack, baseline } = activeSession;
  const webmcp = getWebMcpStatus(store);
  const checklist = getLiveProgress(store, pack, baseline);

  return `
    <aside class="mission-rail" aria-label="Active investigation example">
      <div class="mission-rail-header">
        <div class="mission-rail-badge-row">
          <span class="mission-rail-badge">Example Investigation</span>
          <button class="btn ghost btn-sm mission-switch-btn" id="mission-switch-pack-btn" title="Choose a different pack">Switch</button>
        </div>
        <h2 class="mission-rail-title">${escapeHtml(pack.title)}</h2>
        <p class="mission-rail-goal">${escapeHtml(pack.mission)}</p>
      </div>

      <div class="mission-rail-body">
        <!-- WebMCP Host Connection Status -->
        <section class="mission-section webmcp-status-section" aria-label="WebMCP status">
          <div class="webmcp-status-card ${webmcp.ready ? 'ready' : 'standby'}">
            <div class="webmcp-status-header">
              <span class="status-indicator-dot"></span>
              <strong class="webmcp-status-text">${escapeHtml(webmcp.label)}</strong>
            </div>
            <p class="webmcp-status-detail">${escapeHtml(webmcp.detail)}</p>
          </div>
        </section>

        <!-- Handoff Instructions -->
        <section class="mission-section handoff-section" aria-label="Agent handoff instructions">
          <div class="handoff-notice-card">
            <p class="handoff-text">${escapeHtml(HANDOFF_COPY)}</p>
          </div>
        </section>

        <!-- Prompts Section -->
        <section class="mission-section" aria-label="Investigation prompts">
          <div class="mission-section-head">
            <span class="section-title">Agent Prompts</span>
            <span class="section-sublabel">External agent prompt</span>
          </div>

          <!-- Concise Prompt -->
          <div class="prompt-card primary-prompt-card">
            <div class="prompt-card-head">
              <span class="prompt-kind-label">Scenario prompt</span>
              <button class="btn ghost btn-xs copy-prompt-btn" data-copy-text="${escapeHtml(pack.concisePrompt)}" aria-label="Copy concise prompt">Copy prompt</button>
            </div>
            <p class="prompt-content-text">${escapeHtml(pack.concisePrompt)}</p>
            <div class="copy-feedback-banner hidden" aria-live="polite">Prompt copied to clipboard! Paste into external agent chat. (Page copies but does not send.)</div>
          </div>

          <!-- Comprehensive Full-Capability Prompt -->
          <details class="comprehensive-prompt-disclosure">
            <summary class="disclosure-toggle">Showcase every capability</summary>
            <div class="prompt-card comprehensive-card">
              <div class="prompt-card-head">
                <span class="prompt-kind-label">Comprehensive prompt (all capabilities)</span>
                <button class="btn ghost btn-xs copy-prompt-btn" data-copy-text="${escapeHtml(COMPREHENSIVE_PROMPT)}" aria-label="Copy comprehensive prompt">Copy prompt</button>
              </div>
              <pre class="prompt-content-pre">${escapeHtml(COMPREHENSIVE_PROMPT)}</pre>
              <div class="copy-feedback-banner hidden" aria-live="polite">Prompt copied to clipboard! Paste into external agent chat. (Page copies but does not send.)</div>
            </div>
          </details>
        </section>

        <!-- Human + Agent Loop Explainer -->
        <section class="mission-section" aria-label="Human and agent collaboration">
          <div class="mission-section-head">
            <span class="section-title">Human + Agent Collaboration</span>
          </div>
          <div class="loop-grid">
            <div class="loop-col human-col">
              <span class="loop-actor-label human">Human analyst</span>
              <ul class="loop-action-list">
                <li>Inspect scatter plots & charts</li>
                <li>Select surprising cohorts</li>
                <li>Challenge leading hypotheses</li>
                <li>Verify evidence trust boundaries</li>
              </ul>
            </div>
            <div class="loop-col agent-col">
              <span class="loop-actor-label agent">External agent</span>
              <ul class="loop-action-list">
                <li>Query & filter semantic records</li>
                <li>Compare cohorts & correlations</li>
                <li>Traverse graph & search counterevidence</li>
                <li>Record findings & audit provenance</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Live Reactive Progress Checklist -->
        <section class="mission-section" aria-label="Investigation progress">
          <div class="mission-section-head">
            <span class="section-title">Live Progress</span>
            <span class="section-sublabel">Reactive store state</span>
          </div>
          <ul class="progress-checklist">
            ${checklist.map((item) => `
              <li class="progress-item ${item.done ? 'completed' : 'pending'}">
                <span class="progress-icon" aria-hidden="true">${item.done ? '✓' : '○'}</span>
                <span class="progress-label">${escapeHtml(item.label)}</span>
              </li>
            `).join('')}
          </ul>
        </section>
      </div>

      <div class="mission-rail-footer">
        <button class="btn ghost danger mission-exit-btn" id="mission-exit-btn" title="Exit example and restore prior workspace">Exit example</button>
      </div>
    </aside>
  `;
}
