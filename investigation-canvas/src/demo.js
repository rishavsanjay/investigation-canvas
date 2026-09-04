/**
 * Automatic guided demo for Investigation Canvas.
 * Demonstrates an under-3-minute collaborative human + agent investigation
 * using real createWebMcpTools(store) execute handlers for every agent action.
 *
 * Implements a simulated "Demo conversation" panel with ChatGPT-like
 * conversational structure (without ChatGPT trademarks or native claims).
 * Features:
 * - Walkthrough of all 48 tools in 5 functional groups
 * - Simulated human prompts and challenges
 * - Legible Goal -> Action -> Result structure with collapsed Technical details
 * - Pause / Resume and Replay controls
 * - Visual target focus with subtle canvas de-emphasis
 */
import { escapeHtml, filterRecords } from './core.js';
import { createWebMcpTools } from './webmcp.js';

export const TOOL_GROUPS = [
  {
    name: 'Workspace & Selection',
    count: 13,
    representative: ['describe_workspace', 'select_where', 'get_selection', 'add_filter'],
    description: 'Orient across records, coordinate shared visual selections, and filter datasets.'
  },
  {
    name: 'Comparative Analytics',
    count: 7,
    representative: ['compare_selection_to_rest', 'rank_discriminating_features', 'rank_correlations', 'find_outliers'],
    description: 'Compute cohort deltas, rank discriminating features, and detect statistical anomalies.'
  },
  {
    name: 'Evidence, Graph & Trust',
    count: 8,
    representative: ['search_evidence', 'focus_evidence', 'find_counterevidence', 'get_relationship_graph'],
    description: 'Query source documents, verify untrusted material, and traverse entity graph edges.'
  },
  {
    name: 'Hypotheses & Causal Reasoning',
    count: 8,
    representative: ['update_hypothesis', 'fork_hypothesis', 'attach_evidence_to_hypothesis', 'create_finding'],
    description: 'Track competing explanations, link supporting/contradicting evidence, and record findings.'
  },
  {
    name: 'Canvas, Views & History',
    count: 12,
    representative: ['create_canvas_view', 'focus_canvas_view', 'save_analysis_view', 'get_activity_provenance'],
    description: 'Create spatial canvas artifacts, manage views/branches, and audit action provenance.'
  }
];

let demoPaused = false;
let currentRunId = 0;

export function isDemoPaused() {
  return demoPaused;
}

export function setDemoPaused(paused) {
  demoPaused = Boolean(paused);
  if (typeof document !== 'undefined') {
    const btn = document.getElementById('demo-pause-btn');
    if (btn) {
      btn.textContent = demoPaused ? 'Resume' : 'Pause';
      btn.classList.toggle('active', demoPaused);
      btn.setAttribute('aria-pressed', String(demoPaused));
    }
  }
}

export function toggleDemoPause() {
  setDemoPaused(!demoPaused);
}

export function getSpeedFactor() {
  if (typeof window === 'undefined') return 1;
  const params = new URLSearchParams(window.location.search);
  const speed = parseFloat(params.get('demoSpeed'));
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

export function delay(ms, speedFactor = 1, runId = null) {
  const duration = Math.max(2, Math.round(ms / speedFactor));
  if (duration <= 10) {
    return new Promise((resolve) => setTimeout(resolve, duration));
  }
  return new Promise((resolve) => {
    let elapsed = 0;
    const interval = Math.min(60, Math.max(10, Math.round(60 / speedFactor)));
    const timer = setInterval(() => {
      if (runId !== null && runId !== currentRunId) {
        clearInterval(timer);
        return resolve();
      }
      if (!demoPaused) {
        elapsed += interval;
        if (elapsed >= duration) {
          clearInterval(timer);
          resolve();
        }
      }
    }, interval);
  });
}

export function setDemoFocus(selector) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.demo-target-focus').forEach((el) => {
    el.classList.remove('demo-target-focus');
  });
  if (!selector) {
    document.body.classList.remove('demo-active-focus');
    return;
  }
  const el = document.querySelector(selector);
  if (el) {
    document.body.classList.add('demo-active-focus');
    el.classList.add('demo-target-focus');
  }
}

export function formatSemanticInput(toolName, input) {
  if (!input || Object.keys(input).length === 0) return '';
  switch (toolName) {
    case 'select_where':
      if (Array.isArray(input.filters)) {
        return input.filters.map((f) => `${f.field} ${f.op === 'eq' ? '=' : f.op} '${f.value}'`).join(', ');
      }
      return JSON.stringify(input);
    case 'compare_selection_to_rest':
      return 'selected cohort vs rest of dataset';
    case 'search_evidence':
      return `query: "${input.query}"`;
    case 'update_hypothesis':
      return `${input.hypothesisId} → ${input.status} (${input.confidence}%)`;
    case 'attach_evidence_to_hypothesis':
      return `${input.hypothesisId} ← ${input.evidenceId} (${input.stance})`;
    case 'focus_evidence':
      return `open document: ${input.evidenceId}`;
    case 'create_finding':
      return `"${input.title}" (${input.confidence}%)`;
    case 'create_canvas_view':
      return `${input.type} view at (${input.x}, ${input.y})`;
    case 'focus_canvas_view':
      return `view: ${input.viewId}`;
    case 'get_selection':
      return 'read active visual selection';
    case 'fork_hypothesis':
      return `parent: ${input.parentId} → "${input.title}"`;
    case 'add_causal_link':
      return `${input.source} --[${input.label}]--> ${input.target}`;
    case 'get_activity_provenance':
      return `limit: ${input.limit || 40}`;
    case 'describe_workspace':
      return 'inspect records, schema, and hypotheses';
    default:
      return Object.entries(input).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
  }
}

export function summarizeToolResult(result) {
  if (result == null) return 'Completed with no payload';
  if (typeof result !== 'object') return String(result);
  if (Number.isFinite(result.selected)) return `Selected ${result.selected} records`;
  if (Number.isFinite(result.count)) return `Returned ${result.count} records`;
  if (result.title) return `Created or updated: ${result.title}`;
  if (result.focusedViewId) return `Focused canvas view ${result.focusedViewId}`;
  if (result.activity) return `Retrieved ${result.activity.length} provenance events`;
  if (result.candidates) return `Discovered ${result.candidates.length} counterevidence candidates`;
  if (result.findings) return `Retrieved ${result.findings.length} findings`;
  const keys = Object.keys(result).slice(0, 4);
  return keys.length ? `Returned ${keys.join(', ')}` : 'Completed successfully';
}

export function createDemoOverlay() {
  if (typeof document === 'undefined') return null;
  let overlay = document.getElementById('demo-overlay');
  if (!overlay) {
    overlay = document.createElement('aside');
    overlay.id = 'demo-overlay';
    overlay.className = 'demo-overlay demo-conversation-panel';
    overlay.setAttribute('role', 'region');
    overlay.setAttribute('aria-label', 'Demo conversation');
    document.body.appendChild(overlay);
  }
  return overlay;
}

export function createDemoCursor() {
  if (typeof document === 'undefined') return null;
  let cursor = document.getElementById('demo-cursor');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.className = 'demo-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.setAttribute('title', 'In-page simulated cursor');
    cursor.innerHTML = '<span class="demo-cursor-arrow"></span><span class="demo-cursor-ring"></span>';
    document.body.appendChild(cursor);
  }
  return cursor;
}

export function moveDemoCursor(cursor, selector, speedFactor = 1, { click = false, xRatio = 0.5, yRatio = 0.5, actor = 'agent', runId = null } = {}) {
  if (!cursor || typeof document === 'undefined') return Promise.resolve(false);
  const target = document.querySelector(selector);
  if (!target) return Promise.resolve(false);
  const rect = target.getBoundingClientRect();
  cursor.classList.toggle('human', actor === 'human');
  const duration = Math.max(40, Math.round(500 / speedFactor));
  const pulseDuration = Math.max(30, Math.round(300 / speedFactor));
  cursor.style.setProperty('--demo-cursor-duration', `${duration}ms`);
  cursor.style.setProperty('--demo-pulse-duration', `${pulseDuration}ms`);
  cursor.style.setProperty('--demo-cursor-x', `${Math.round(rect.left + rect.width * xRatio)}px`);
  cursor.style.setProperty('--demo-cursor-y', `${Math.round(rect.top + rect.height * yRatio)}px`);
  cursor.classList.add('visible');
  return delay(650, speedFactor, runId).then(() => {
    if (click) {
      cursor.classList.add('clicking');
      return delay(320, speedFactor, runId).then(() => {
        cursor.classList.remove('clicking');
        return true;
      });
    }
    return true;
  });
}

function activateTab(store, tab) {
  const button = typeof document === 'undefined' ? null : document.querySelector(`[data-tab="${tab}"]`);
  if (button) button.click();
  else store.mutate((s) => { s.activeTab = tab; }, { history: false });
}

function bindPanelControls(overlay) {
  if (!overlay || typeof overlay.addEventListener !== 'function' || overlay._eventsBound) return;
  overlay._eventsBound = true;

  overlay.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!target) return;

    if (target.closest('#demo-pause-btn')) {
      toggleDemoPause();
    } else if (target.closest('#demo-replay-btn')) {
      // A reload gives Replay a clean deterministic state and prevents an old
      // async run from racing the new one.
      if (typeof window !== 'undefined') window.location.reload();
    } else if (target.closest('#demo-show-catalog')) {
      const showToolsBtn = document.querySelector('#show-tools');
      if (showToolsBtn) {
        showToolsBtn.click();
      }
    }
  });
}

function renderCapabilitiesCard() {
  return `
    <div class="demo-msg demo-msg-agent demo-walkthrough-msg">
      <div class="demo-msg-header">
        <span class="demo-agent-avatar">✦</span>
        <div>
          <strong class="demo-msg-agent-name">WebMCP Agent</strong>
          <span class="demo-agent-state">System Capabilities</span>
        </div>
      </div>
      <div class="demo-walkthrough-card">
        <div class="demo-walkthrough-head">
          <div>
            <div class="demo-walkthrough-title">WebMCP Capability Walkthrough (48 tools)</div>
            <div class="demo-walkthrough-desc">Five functional groups covering the full investigation lifecycle. Every displayed action executes against live state.</div>
          </div>
          <button class="demo-catalog-btn" id="demo-show-catalog">View full catalog (48 tools)</button>
        </div>
        <div class="demo-tool-groups">
          ${TOOL_GROUPS.map((g) => `
            <div class="demo-tool-group-card">
              <div class="demo-tool-group-top">
                <span class="demo-tool-group-name">${escapeHtml(g.name)}</span>
                <span class="demo-tool-group-badge">${g.count} tools</span>
              </div>
              <div class="demo-tool-group-desc">${escapeHtml(g.description)}</div>
              <div class="demo-tool-group-reps">
                ${g.representative.map((t) => `<code class="demo-tool-pill">${escapeHtml(t)}</code>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Update the Demo Conversation panel.
 * Maintains chat-like message history while retaining backwards-compatible
 * selectors and structures for automated tests and inspection.
 */
export function updateDemoOverlay(overlay, status = {}) {
  if (!overlay) return;

  const {
    actor = 'AGENT',
    step = '',
    title = '',
    detail = '',
    goal = '',
    tool = '',
    toolInput = null,
    toolState = '',
    toolResult = '',
    rawResult = null,
    humanText = '',
    agentText = '',
    isWalkthrough = false
  } = status;

  const isHuman = actor.toUpperCase().includes('HUMAN');
  const isComplete = actor.toUpperCase().includes('COMPLETE') || step === 'COMPLETE';
  const stateLabel = isComplete
    ? 'Run complete'
    : isHuman
    ? 'Human challenge'
    : tool
    ? (toolState === 'complete' ? 'Tool completed' : toolState === 'error' ? 'Tool failed' : 'Executing tool')
    : isWalkthrough
    ? 'Capabilities'
    : 'Reasoning';

  const semanticInput = formatSemanticInput(tool, toolInput);
  const resultSummary = toolResult || (toolState === 'complete' ? detail : '');
  const stepGoal = goal || title || (tool ? `Execute ${tool}` : 'Investigate dataset anomaly');

  // If overlay doesn't have conversation container initialized or is mock object:
  if (!overlay._initialized || !overlay.querySelector || !overlay.querySelector('#demo-messages')) {
    overlay._history = overlay._history || [];
    overlay._initialized = true;

    overlay.innerHTML = `
      <div class="demo-panel-header">
        <div class="demo-header-left">
          <div class="demo-panel-badge">Demo conversation</div>
          <div class="demo-panel-sub">Simulated human + agent collaboration</div>
        </div>
        <div class="demo-header-controls">
          <button class="demo-ctrl-btn" id="demo-pause-btn" title="Pause or resume demo">${demoPaused ? 'Resume' : 'Pause'}</button>
          <button class="demo-ctrl-btn" id="demo-replay-btn" title="Replay demo from beginning">Replay</button>
        </div>
      </div>
      <div class="demo-messages" id="demo-messages"></div>
      <div class="demo-panel-footer">
        <div class="demo-agent-header">
          <span class="demo-agent-avatar">✦</span>
          <div><strong class="demo-agent-name">WebMCP Agent</strong><span class="demo-agent-state">${escapeHtml(stateLabel)}</span></div>
          ${step ? `<span class="demo-step">${escapeHtml(step)}</span>` : ''}
        </div>
        <div class="demo-badge-row"><span class="demo-actor ${isHuman ? 'human' : isComplete ? 'complete' : 'agent'}">${escapeHtml(actor)}</span></div>
        <div class="demo-caption-title">${escapeHtml(title)}</div>
        ${detail ? `<div class="demo-caption-detail">${escapeHtml(detail)}</div>` : ''}
        ${tool ? `
          <div class="demo-tool-call ${toolState === 'complete' ? 'complete' : ''}">
            <div>
              <span>${toolState === 'complete' ? 'COMPLETED' : toolState === 'error' ? 'FAILED' : 'RUNNING TOOL'}</span>
              <code>${escapeHtml(tool)}</code>
            </div>
            <div class="demo-gar-block">
              <div class="demo-gar-row">
                <span class="demo-gar-label">Goal:</span>
                <span class="demo-gar-val">${escapeHtml(stepGoal)}</span>
              </div>
              <div class="demo-gar-row">
                <span class="demo-gar-label">Action:</span>
                <span class="demo-gar-val"><span class="demo-tool-name">${escapeHtml(tool)}</span> ${semanticInput ? `<span class="demo-semantic-input">(${escapeHtml(semanticInput)})</span>` : ''}</span>
              </div>
              <div class="demo-gar-row demo-tool-result">
                <span class="demo-gar-label">Result:</span>
                <span class="demo-gar-val">${escapeHtml(resultSummary || (toolState === 'complete' ? 'Tool executed successfully' : 'Executing local WebMCP handler…'))}</span>
              </div>
            </div>
            ${toolInput != null ? `
              <details class="demo-tech-details">
                <summary>Technical details</summary>
                <pre class="demo-tool-args">${escapeHtml(JSON.stringify(toolInput, null, 2))}</pre>
              </details>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;

    bindPanelControls(overlay);
  }

  // Update footer status card (keeps compatibility with existing tests checking `.demo-actor`, `.demo-agent-name`, `.demo-tool-call code`, etc.)
  const footerEl = overlay.querySelector ? overlay.querySelector('.demo-panel-footer') : null;
  if (footerEl) {
    footerEl.innerHTML = `
      <div class="demo-agent-header">
        <span class="demo-agent-avatar">✦</span>
        <div><strong class="demo-agent-name">WebMCP Agent</strong><span class="demo-agent-state">${escapeHtml(stateLabel)}</span></div>
        ${step ? `<span class="demo-step">${escapeHtml(step)}</span>` : ''}
      </div>
      <div class="demo-badge-row"><span class="demo-actor ${isHuman ? 'human' : isComplete ? 'complete' : 'agent'}">${escapeHtml(actor)}</span></div>
      <div class="demo-caption-title">${escapeHtml(title)}</div>
      ${detail ? `<div class="demo-caption-detail">${escapeHtml(detail)}</div>` : ''}
      ${tool ? `
        <div class="demo-tool-call ${toolState === 'complete' ? 'complete' : ''}">
          <div>
            <span>${toolState === 'complete' ? 'COMPLETED' : toolState === 'error' ? 'FAILED' : 'RUNNING TOOL'}</span>
            <code>${escapeHtml(tool)}</code>
          </div>
          <div class="demo-gar-block">
            <div class="demo-gar-row">
              <span class="demo-gar-label">Goal:</span>
              <span class="demo-gar-val">${escapeHtml(stepGoal)}</span>
            </div>
            <div class="demo-gar-row">
              <span class="demo-gar-label">Action:</span>
              <span class="demo-gar-val"><span class="demo-tool-name">${escapeHtml(tool)}</span> ${semanticInput ? `<span class="demo-semantic-input">(${escapeHtml(semanticInput)})</span>` : ''}</span>
            </div>
            <div class="demo-gar-row demo-tool-result">
              <span class="demo-gar-label">Result:</span>
              <span class="demo-gar-val">${escapeHtml(resultSummary || (toolState === 'complete' ? 'Tool executed successfully' : 'Executing local WebMCP handler…'))}</span>
            </div>
          </div>
          ${toolInput != null ? `
            <details class="demo-tech-details">
              <summary>Technical details</summary>
              <pre class="demo-tool-args">${escapeHtml(JSON.stringify(toolInput, null, 2))}</pre>
            </details>
          ` : ''}
        </div>
      ` : ''}
    `;
  }

  // Update conversational stream in #demo-messages
  const messagesEl = overlay.querySelector ? overlay.querySelector('#demo-messages') : null;
  if (messagesEl) {
    if (isWalkthrough) {
      if (!messagesEl.querySelector('.demo-walkthrough-msg')) {
        messagesEl.insertAdjacentHTML('beforeend', renderCapabilitiesCard());
        bindPanelControls(overlay);
      }
    } else if (humanText) {
      messagesEl.insertAdjacentHTML('beforeend', `
        <div class="demo-msg demo-msg-human">
          <div class="demo-msg-header">
            <span class="demo-human-avatar">👤</span>
            <div>
              <strong class="demo-human-name">Human Analyst</strong>
              <span class="demo-actor-badge human">${escapeHtml(actor)}</span>
            </div>
          </div>
          <div class="demo-msg-content">${escapeHtml(humanText)}</div>
        </div>
      `);
    } else if (agentText) {
      messagesEl.insertAdjacentHTML('beforeend', `
        <div class="demo-msg demo-msg-agent">
          <div class="demo-msg-header">
            <span class="demo-agent-avatar">✦</span>
            <div>
              <strong class="demo-msg-agent-name">WebMCP Agent</strong>
              <span class="demo-agent-state">Analysis Synthesis</span>
            </div>
          </div>
          <div class="demo-msg-content">${escapeHtml(agentText)}</div>
        </div>
      `);
    } else if (tool) {
      // Find or create current tool step card in stream
      let stepCard = messagesEl.querySelector(`[data-tool-step="${escapeHtml(tool)}"][data-step-id="${escapeHtml(step)}"]`);
      const cardHtml = `
        <div class="demo-step-card ${toolState === 'complete' ? 'complete' : toolState === 'error' ? 'error' : 'running'}" data-tool-step="${escapeHtml(tool)}" data-step-id="${escapeHtml(step)}">
          <div class="demo-step-head">
            <span class="demo-step-badge ${toolState === 'complete' ? 'complete' : toolState === 'error' ? 'error' : 'running'}">
              ${toolState === 'complete' ? 'COMPLETED' : toolState === 'error' ? 'FAILED' : 'RUNNING TOOL'}
            </span>
            <code>${escapeHtml(tool)}</code>
          </div>
          <div class="demo-gar-block">
            <div class="demo-gar-row">
              <span class="demo-gar-label">Goal:</span>
              <span class="demo-gar-val">${escapeHtml(stepGoal)}</span>
            </div>
            <div class="demo-gar-row">
              <span class="demo-gar-label">Action:</span>
              <span class="demo-gar-val"><code>${escapeHtml(tool)}</code> ${semanticInput ? `<span class="demo-semantic-input">(${escapeHtml(semanticInput)})</span>` : ''}</span>
            </div>
            <div class="demo-gar-row demo-tool-result">
              <span class="demo-gar-label">Result:</span>
              <span class="demo-gar-val">${escapeHtml(resultSummary || (toolState === 'complete' ? 'Tool executed successfully' : 'Executing local WebMCP handler…'))}</span>
            </div>
          </div>
          ${toolInput != null ? `
            <details class="demo-tech-details">
              <summary>Technical details</summary>
              <pre class="demo-tool-args">${escapeHtml(JSON.stringify({ input: toolInput, result: rawResult ?? resultSummary }, null, 2))}</pre>
            </details>
          ` : ''}
        </div>
      `;

      if (stepCard) {
        stepCard.outerHTML = cardHtml;
      } else {
        messagesEl.insertAdjacentHTML('beforeend', cardHtml);
      }
    }

    // Auto-scroll messages stream to keep up with progress
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

/**
 * Main scenario execution.
 * Coordinates human prompts, tool operations, cursor animation, visual focus,
 * and conversational feedback within ~100-120 seconds target at normal speed.
 */
export async function runDemoScenario(store, options = {}) {
  const speed = options.speed || (typeof window !== 'undefined' ? getSpeedFactor() : 1);
  const overlay = options.overlay ?? createDemoOverlay();
  const cursor = options.cursor ?? createDemoCursor();
  const runId = ++currentRunId;

  // Reset to deterministic checkout-regression dataset
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem('investigation-canvas-state-v1'); } catch (_) {}
  }
  store.loadDataset('checkout-regression');
  store.clearFilters('system');
  store.clearSelection('system');
  store.mutate((s) => {
    s.activeTab = 'explore';
  }, { history: false });

  if (overlay) {
    overlay._initialized = false;
  }

  let currentStep = '';
  const setStatus = (status) => {
    if (runId !== currentRunId) return;
    if (status.step) currentStep = status.step;
    updateDemoOverlay(overlay, status);
  };

  const rawTools = createWebMcpTools(store);
  const toolsByName = new Map();

  rawTools.forEach((t) => {
    const origExecute = t.execute;
    const wrappedTool = {
      ...t,
      execute: async (input = {}, { goal = '' } = {}) => {
        if (runId !== currentRunId) return null;
        setStatus({
          actor: 'AGENT',
          step: currentStep,
          title: `Running ${t.name}`,
          detail: 'Calling WebMCP tool handler.',
          goal: goal || `Call ${t.name}`,
          tool: t.name,
          toolInput: input,
          toolState: 'running'
        });

        // Keep both the action and its outcome readable during a recorded demo.
        await delay(2100, speed, runId);
        if (runId !== currentRunId) return null;

        try {
          const result = await origExecute(input);
          const summary = summarizeToolResult(result);
          setStatus({
            actor: 'AGENT',
            step: currentStep,
            title: `${t.name} completed`,
            detail: summary,
            goal: goal || `Execute ${t.name}`,
            tool: t.name,
            toolInput: input,
            toolState: 'complete',
            toolResult: summary,
            rawResult: result
          });

          await delay(1700, speed, runId);
          return result;
        } catch (err) {
          setStatus({
            actor: 'AGENT',
            step: currentStep,
            title: `${t.name} failed`,
            detail: err.message,
            goal: goal || `Execute ${t.name}`,
            tool: t.name,
            toolInput: input,
            toolState: 'error',
            toolResult: err.message
          });
          throw err;
        }
      }
    };
    toolsByName.set(t.name, wrappedTool);
  });

  const tool = (name) => async (input = {}, meta = {}) => {
    const t = toolsByName.get(name);
    if (!t) throw new Error(`Missing tool: ${name}`);
    return t.execute(input, meta);
  };

  // 0. Walkthrough of all 48 tools in 5 groups
  setStatus({
    actor: 'AGENT',
    step: 'Intro',
    title: 'WebMCP Tool Capabilities',
    detail: '48 tools grouped into Workspace, Comparative Analytics, Evidence, Hypotheses, and Canvas.',
    isWalkthrough: true
  });
  await delay(7000, speed, runId);
  if (runId !== currentRunId) return { ok: false };

  // Prompt 1 (Human)
  setStatus({
    actor: 'HUMAN',
    step: 'Goal',
    title: 'Human inquiry',
    detail: 'Conversion dropped this week. Investigate the cause.',
    humanText: 'Conversion dropped this week. Investigate the cause. Keep competing hypotheses and show the evidence.'
  });
  await delay(4200, speed, runId);
  if (runId !== currentRunId) return { ok: false };

  // 1. Orient
  setDemoFocus('.dataset-title');
  await moveDemoCursor(cursor, '.dataset-title', speed, { click: true, runId });
  currentStep = '1 / 8';
  await tool('describe_workspace')({}, {
    goal: 'Inspect records, schema, baseline hypotheses, and workspace structure'
  });
  // 2. Select and compare mobile Safari 20.2 + web-4.7.2 cohort
  currentStep = '2 / 8';
  setDemoFocus('.chart-card');
  await moveDemoCursor(cursor, '#scatter-svg', speed, { xRatio: 0.35, yRatio: 0.45, click: true, runId });
  await tool('select_where')({
    filters: [
      { field: 'platform', op: 'eq', value: 'mobile' },
      { field: 'browser', op: 'eq', value: 'Safari 20.2' },
      { field: 'version', op: 'eq', value: 'web-4.7.2' }
    ]
  }, {
    goal: 'Isolate mobile Safari 20.2 on web-4.7.2'
  });

  setDemoFocus('#scatter-svg');
  await moveDemoCursor(cursor, '#scatter-svg .point.selected', speed, { click: true, runId });
  const comparison = await tool('compare_selection_to_rest')({}, {
    goal: 'Calculate numeric and categorical differences vs baseline'
  });

  const convMetric = comparison?.numeric?.find((m) => m.field === 'conversion');
  const latMetric = comparison?.numeric?.find((m) => m.field === 'latency');
  const convDeltaText = convMetric?.delta != null
    ? `${convMetric.delta > 0 ? '+' : ''}${convMetric.delta.toFixed(2)}%`
    : 'a measurable';
  const latDeltaText = latMetric?.delta != null
    ? `+${Math.round(latMetric.delta)}ms`
    : 'a measurable';

  // 3. Search evidence & update client and payment hypotheses
  currentStep = '3 / 8';
  setDemoFocus('[data-tab="hypotheses"]');
  await tool('search_evidence')({ query: 'Safari' }, {
    goal: 'Search release notes and support clusters for Safari issues'
  });
  await tool('search_evidence')({ query: 'payment' }, {
    goal: 'Verify payment service health checks'
  });

  const clientHyp = store.state.hypotheses.find((h) => h.id === 'hyp-client') || store.state.hypotheses[0];
  const paymentHyp = store.state.hypotheses.find((h) => h.id === 'hyp-payment') || store.state.hypotheses[1];

  await tool('update_hypothesis')({
    hypothesisId: clientHyp.id,
    status: 'supported',
    confidence: 85,
    notes: `Mobile Safari 20.2 shows ${convDeltaText} conversion drop and ${latDeltaText} latency regression after web-4.7.2 deploy.`
  }, {
    goal: 'Mark client-side regression supported (85% confidence)'
  });

  await tool('update_hypothesis')({
    hypothesisId: paymentHyp.id,
    status: 'weakened',
    confidence: 10,
    notes: 'Payment API health check demonstrates baseline authorization rate throughout conversion drop.'
  }, {
    goal: 'Weaken payment service hypothesis (10% confidence)'
  });

  await moveDemoCursor(cursor, '[data-tab="hypotheses"]', speed, { click: true, runId });
  activateTab(store, 'hypotheses');
  setDemoFocus('.hypothesis-grid');
  await delay(1500, speed, runId);

  // 4. Attach evidence
  currentStep = '4 / 8';
  await tool('attach_evidence_to_hypothesis')({
    hypothesisId: clientHyp.id,
    evidenceId: 'doc-release-472',
    stance: 'supporting'
  }, {
    goal: 'Attach web-4.7.2 release notes to client hypothesis'
  });
  await tool('attach_evidence_to_hypothesis')({
    hypothesisId: clientHyp.id,
    evidenceId: 'doc-support-safari',
    stance: 'supporting'
  }, {
    goal: 'Attach Safari support tickets to client hypothesis'
  });
  await tool('attach_evidence_to_hypothesis')({
    hypothesisId: paymentHyp.id,
    evidenceId: 'doc-incident-payment',
    stance: 'contradicting'
  }, {
    goal: 'Attach payment health check as contradicting payment failure'
  });

  // Visibly open evidence document in evidence reader
  setDemoFocus('[data-tab="evidence"]');
  await moveDemoCursor(cursor, '[data-tab="evidence"]', speed, { click: true, runId });
  await tool('focus_evidence')({ evidenceId: 'doc-release-472' }, {
    goal: 'Open web-4.7.2 release notes in evidence reader'
  });
  setDemoFocus('.doc-body');
  await delay(1800, speed, runId);

  // 5. Create finding and canvas artifact
  currentStep = '5 / 8';
  const finding1 = await tool('create_finding')({
    title: 'Mobile Safari 20.2 checkout loop regression in web-4.7.2',
    text: `Mobile Safari 20.2 cohort on web-4.7.2 exhibits ${convDeltaText} conversion regression with ${latDeltaText} latency following optimistic form locking.`,
    confidence: 88,
    evidenceIds: ['doc-release-472', 'doc-support-safari']
  }, {
    goal: 'Record structured finding with evidence links'
  });

  const canvasView = await tool('create_canvas_view')({
    type: 'summary',
    title: 'Finding: Safari 20.2 loop in web-4.7.2',
    content: `${finding1.title}\n\n${finding1.text}\nConfidence: 88%`,
    x: 40,
    y: 1100,
    w: 520,
    h: 220
  }, {
    goal: 'Create persistent visual finding artifact on spatial canvas'
  });

  setDemoFocus('[data-tab="canvas"]');
  await moveDemoCursor(cursor, '[data-tab="canvas"]', speed, { click: true, runId });
  activateTab(store, 'canvas');
  if (canvasView?.id) {
    try {
      await tool('focus_canvas_view')({ viewId: canvasView.id }, {
        goal: 'Center spatial canvas on agent-created finding'
      });
    } catch (_) {}
  }
  setDemoFocus('.spatial-shell');
  await delay(2000, speed, runId);

  // Agent interim synthesis
  setStatus({
    actor: 'AGENT',
    step: '5 / 8',
    title: 'Interim investigation summary',
    detail: 'Primary cause verified: mobile Safari 20.2 regression in web-4.7.2.',
    agentText: `I investigated the conversion drop: mobile Safari 20.2 users on web-4.7.2 experienced a ${convDeltaText} conversion regression and ${latDeltaText} latency spike caused by form locking regressions. Payment gateway health checks remained baseline throughout, weakening the payment hypothesis. I've recorded the finding, attached source evidence, and placed an inspectable summary card on the Canvas.`
  });
  await delay(2800, speed, runId);

  // 6. Simulate HUMAN challenge: select desktop price-test-B + web-4.7.2
  currentStep = '6 / 8';
  setDemoFocus('[data-tab="explore"]');
  await moveDemoCursor(cursor, '[data-tab="explore"]', speed, { click: true, runId });
  activateTab(store, 'explore');

  const humanMatched = filterRecords(store.state.dataset.records, [
    { field: 'platform', op: 'eq', value: 'desktop' },
    { field: 'cohort', op: 'eq', value: 'price-test-B' },
    { field: 'version', op: 'eq', value: 'web-4.7.2' }
  ]);
  const humanIds = humanMatched.map((r) => r.id);

  setDemoFocus('.chart-card');
  setStatus({
    actor: 'HUMAN CHALLENGE',
    step: '6 / 8',
    title: 'Human challenges agent explanation',
    detail: 'Selected desktop points',
    humanText: 'These desktop points don’t fit the Safari explanation. Investigate them separately.'
  });

  await moveDemoCursor(cursor, '#scatter-svg', speed, { xRatio: 0.2, yRatio: 0.35, actor: 'human', click: true, runId });
  await moveDemoCursor(cursor, '#scatter-svg', speed, { xRatio: 0.72, yRatio: 0.68, actor: 'human', click: true, runId });
  // Visibly set human selection
  store.setSelection(humanIds, 'human');
  await delay(2800, speed, runId);

  // 7. Agent reads human selection, forks independent hypothesis, attaches evidence & finding
  currentStep = '7 / 8';
  setDemoFocus('.selection-banner');
  await moveDemoCursor(cursor, '.selection-banner', speed, { actor: 'agent', click: true, runId });
  const humanSelection = await tool('get_selection')({}, {
    goal: 'Read human selection from shared workspace'
  });
  const humanComp = await tool('compare_selection_to_rest')({}, {
    goal: 'Analyze human-selected desktop cohort vs rest'
  });
  const priceConvMetric = humanComp?.numeric?.find((m) => m.field === 'conversion');
  const priceDeltaText = priceConvMetric?.delta != null
    ? `${priceConvMetric.delta > 0 ? '+' : ''}${priceConvMetric.delta.toFixed(2)}%`
    : 'a measurable';

  await tool('search_evidence')({ query: 'pricing' }, {
    goal: 'Search for pricing experiment documentation'
  });

  const forkedHyp = await tool('fork_hypothesis')({
    parentId: clientHyp.id,
    title: 'Desktop pricing experiment B independently suppressed conversion',
    forkReason: 'Human challenged agent with desktop price-test-B points showing an independent conversion drop.',
    confidence: 80,
    notes: `Human selection of ${humanSelection.count} desktop records isolated price-test-B with ${priceDeltaText} conversion regression.`
  }, {
    goal: 'Fork competing hypothesis for independent pricing regression'
  });

  await tool('attach_evidence_to_hypothesis')({
    hypothesisId: forkedHyp.id,
    evidenceId: 'doc-experiment-b',
    stance: 'supporting'
  }, {
    goal: 'Link pricing experiment report to forked hypothesis'
  });

  const finding2 = await tool('create_finding')({
    title: 'Independent regression in desktop price-test-B cohort',
    text: `Analysis of the human-selected desktop records revealed a secondary, independent ${priceDeltaText} conversion regression caused by annualized pricing presentation in Variant B.`,
    confidence: 82,
    evidenceIds: ['doc-experiment-b']
  }, {
    goal: 'Record secondary finding for desktop experiment regression'
  });

  if (finding2?.id && forkedHyp?.id) {
    try {
      await tool('add_causal_link')({
        source: forkedHyp.id,
        target: finding2.id,
        label: 'explains',
        confidence: 80
      }, {
        goal: 'Add causal link: forked hypothesis explains pricing finding'
      });
    } catch (_) {}
  }

  // Agent final forked-hypothesis response
  setStatus({
    actor: 'AGENT',
    step: '7 / 8',
    title: 'Forked hypothesis and recorded finding',
    detail: `Forked hypothesis "${forkedHyp.title}" and linked experiment doc-experiment-b.`,
    agentText: `Good catch. Isolating those desktop points reveals an independent regression: Variant B of the pricing experiment changed billing presentation to annualized display, suppressing desktop conversion by ${priceDeltaText}. I forked a competing hypothesis, attached the test report, and established a causal link.`
  });
  await delay(2800, speed, runId);

  // 8. Finish on Provenance
  currentStep = '8 / 8';
  setDemoFocus('[data-tab="provenance"]');
  await moveDemoCursor(cursor, '[data-tab="provenance"]', speed, { click: true, runId });
  activateTab(store, 'provenance');
  setDemoFocus('.activity-list');
  const prov = await tool('get_activity_provenance')({ limit: 40 }, {
    goal: 'Retrieve complete auditable provenance trail'
  });
  const agentActions = prov?.activity?.filter((a) => a.source === 'agent').length || 0;
  const humanActions = prov?.activity?.filter((a) => a.source === 'human').length || 0;

  setDemoFocus(null);
  setStatus({
    actor: 'COMPLETE',
    step: 'COMPLETE',
    title: 'Investigation demo completed',
    detail: `Auditable provenance preserved: ${agentActions} agent tool actions and ${humanActions} human actions logged. Inspect Provenance, Hypotheses, or Canvas.`
  });

  return { ok: true };
}

export function initDemo(store) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') !== '1') return;

  const overlay = createDemoOverlay();
  const cursor = createDemoCursor();

  runDemoScenario(store, { overlay, cursor }).catch((err) => {
    console.error('[Demo Error]', err);
    updateDemoOverlay(overlay, {
      actor: 'ERROR',
      step: 'FAILED',
      title: 'Demo encountered an error',
      detail: err.message
    });
  });
}
