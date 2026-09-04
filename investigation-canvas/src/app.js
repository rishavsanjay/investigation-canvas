import { InvestigationStore } from './store.js';
import {
  escapeHtml,
  extent,
  filterRecords,
  formatNumber,
  groupCounts,
  mean,
  rankCorrelations,
  findOutliers,
  rankDiscriminatingFeatures,
  safeNumber
} from './core.js';
import { SAMPLE_DATASETS } from './sampleData.js';
import { createWebMcpTools, registerWebMcp } from './webmcp.js';
import { renderSpatialCanvas, bindSpatialCanvasEvents, renderEvidenceMedia } from './workspace.js';
import { loadFileSource, loadPublicApiSource } from './dataClient.js';
// POST_ZIP_ENHANCEMENTS_V2: app

const store = new InvestigationStore();
const root = document.getElementById('app');
const fileInput = document.getElementById('file-input');
const palette = ['#7aa2ff', '#62cfe5', '#bd9cff', '#66d19e', '#f4c96b', '#f0a35b', '#ff7d85', '#8fd0a9'];
let modal = null;
let modalReturnFocus = null;
let evidenceSearch = '';
let tooltip = null;
let toastTimer = null;
let scrollRestoreFrame = null;
let pointPointerScroll = null;

function captureViewportScroll() {
  const content = document.querySelector('.content');
  return {
    contentTop: content?.scrollTop || 0,
    contentLeft: content?.scrollLeft || 0,
    windowX: window.scrollX,
    windowY: window.scrollY
  };
}

function scheduleViewportRestore(scroll) {
  const restore = () => {
    const content = document.querySelector('.content');
    if (content) {
      content.scrollTop = scroll.contentTop;
      content.scrollLeft = scroll.contentLeft;
    }
    if (typeof window !== 'undefined') window.scrollTo(scroll.windowX, scroll.windowY);
  };
  restore();
  if (scrollRestoreFrame !== null) cancelAnimationFrame(scrollRestoreFrame);
  scrollRestoreFrame = requestAnimationFrame(() => {
    restore();
    scrollRestoreFrame = null;
  });
}

const e = escapeHtml;
const label = (field) => String(field || '—').replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
const colorFor = (value, values) => palette[Math.max(0, values.indexOf(String(value))) % palette.length];
const timeShort = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso ?? '') : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' });
};

function toast(message) {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'true');
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  stack.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

function download(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function metricCard(title, value, note, color = 'var(--accent)') {
  return `<div class="card metric-card" style="--metric-color:${color}"><div class="metric-label">${e(title)}</div><div class="metric-value">${e(value)}</div><div class="metric-note">${e(note)}</div></div>`;
}

function renderTopbar(s) {
  const storageFailed = s.persistence?.ok === false;
  const mcpText = storageFailed ? 'Storage warning' : s.webmcp.available ? `${s.webmcp.registered} WebMCP tools` : 'WebMCP preview';
  return `<header class="topbar">
    <div class="brand"><div class="brand-mark"></div><div><div class="brand-title">Investigation Canvas</div><div class="dataset-title">${e(s.dataset.title)}</div></div></div>
    <nav class="tabbar" aria-label="Workspace tabs">
      ${[['explore','Explore'],['canvas','Canvas'],['hypotheses','Hypotheses'],['evidence','Evidence'],['provenance','Provenance']].map(([id,name]) => `<button class="tab ${s.activeTab===id?'active':''}" data-tab="${id}">${name}</button>`).join('')}
    </nav>
    <div class="top-actions">
      <span class="status-pill ${storageFailed?'error':s.webmcp.available?'live':''}" title="${e(storageFailed?s.persistence.lastError:s.webmcp.lastError || '')}"><i class="status-dot"></i>${e(mcpText)}</span>
      <button class="btn ghost" id="undo-btn" title="Undo">Undo</button>
      <button class="btn ghost" id="redo-btn" title="Redo">Redo</button>
      <button class="btn" id="import-btn">Import</button>
      <button class="btn" id="api-btn">Connect API</button>
      <button class="btn primary" id="export-btn">Export</button>
    </div>
  </header>`;
}

function renderSidebar(s) {
  const visible = store.getVisibleRecords();
  const fieldOptions = [...s.dataset.keyFields, ...s.dataset.numericFields].map((f) => `<option value="${e(f)}">${e(label(f))}</option>`).join('');
  return `<aside class="sidebar ${s.ui.leftCollapsed?'collapsed':''}">
    <div class="sidebar-header"><span class="sidebar-title">Investigation</span><button class="btn icon ghost" id="toggle-left">${s.ui.leftCollapsed?'›':'‹'}</button></div>
    <div class="sidebar-body">
      <section class="section">
        <div class="section-head"><span class="section-label">Case</span></div>
        <select class="dataset-switcher" id="dataset-switcher">
          ${SAMPLE_DATASETS.map((d) => `<option value="${e(d.id)}" ${s.dataset.id===d.id?'selected':''}>${e(d.title)}</option>`).join('')}
          ${!SAMPLE_DATASETS.some(d=>d.id===s.dataset.id)?`<option selected value="${e(s.dataset.id)}">${e(s.dataset.title)}</option>`:''}
        </select>
        <div class="kv"><span>Records</span><strong>${visible.length.toLocaleString()} / ${s.dataset.records.length.toLocaleString()}</strong></div>
        <div class="kv"><span>Documents</span><strong>${s.dataset.documents.length}</strong></div>
        <div class="kv"><span>Relationships</span><strong>${s.dataset.graph.edges.length}</strong></div>
        <div class="source-card"><span class="source-kind">${e(s.dataset.provenance?.kind || 'sample')}</span><strong>${e(s.dataset.provenance?.label || 'Bundled demo')}</strong><p>${e(s.dataset.provenance?.description || 'Local investigation dataset')}</p></div>
      </section>
      <section class="section">
        <div class="section-head"><span class="section-label">Search everything</span></div>
        <input class="search" id="global-search" value="${e(s.search)}" placeholder="Press Enter to search records" />
      </section>
      <section class="section">
        <div class="section-head"><span class="section-label">Filters</span>${s.filters.length?'<button class="btn ghost" id="clear-filters">Clear</button>':''}</div>
        <div class="filter-list">${s.filters.map((f) => `<div class="filter-chip"><span>${e(label(f.field))} ${e(f.op || 'eq')} ${e(f.value ?? `${f.min}…${f.max}`)}</span><button data-remove-filter="${e(f.id)}">×</button></div>`).join('')}</div>
        <div class="filter-form" style="margin-top:8px"><select id="quick-filter-field" class="filter-field">${fieldOptions}</select><select id="quick-filter-op"><option value="eq">equals</option><option value="neq">not equal</option><option value="contains">contains</option><option value="gt">&gt;</option><option value="gte">≥</option><option value="lt">&lt;</option><option value="lte">≤</option></select><input id="quick-filter-value" placeholder="value" /></div>
        <button class="btn" id="quick-filter-add" style="margin-top:6px;width:100%">Add filter</button>
      </section>
      <section class="section">
        <div class="section-head"><span class="section-label">Saved views</span><button class="btn ghost" id="save-view">Save</button></div>
        ${s.savedViews.length ? s.savedViews.slice(0,6).map(v => `<div class="saved-item" role="button" tabindex="0" data-restore-view="${e(v.id)}"><div class="saved-item-title">${e(v.name)}</div><div class="saved-item-meta">${v.filters.length} filters · ${v.selection.length} selected</div></div>`).join('') : '<div class="empty" style="padding:12px 4px">No saved views yet</div>'}
      </section>
      <section class="section">
        <div class="section-head"><span class="section-label">Branches</span><button class="btn ghost" id="new-branch">Branch</button></div>
        ${s.branches.length ? s.branches.slice(0,5).map(v => `<div class="saved-item" role="button" tabindex="0" data-restore-branch="${e(v.id)}"><div class="saved-item-title">${e(v.name)}</div><div class="saved-item-meta">restorable analysis state</div></div>`).join('') : '<div class="empty" style="padding:12px 4px">No branches yet</div>'}
      </section>
    </div>
  </aside>`;
}

function agentSuggestions(s) {
  if (s.selection.length) return ['Why are these different from the rest?', 'Try to disprove the leading hypothesis using this selection.', 'Find the strongest feature that explains these points.'];
  if (s.dataset.id === 'checkout-regression') return ['Conversion dropped this week. Investigate the cause.', 'Find multiple independent regressions, not just the largest one.', 'Rule out the payment service and show me the evidence.'];
  if (s.dataset.id === 'model-regression') return ['Why did validation accuracy regress?', 'Find runs that contradict the dataset-v7 explanation.', 'Compare the strongest two failure modes.'];
  return ['Find the strongest coordinated pattern.', 'Build competing hypotheses and try to falsify each.', 'Which evidence is untrusted and what can we corroborate?'];
}

function renderRightbar(s) {
  return `<aside class="rightbar ${s.ui.rightCollapsed?'collapsed':''}">
    <div class="sidebar-header"><span class="sidebar-title">Agent + Activity</span><button class="btn icon ghost" id="toggle-right">${s.ui.rightCollapsed?'‹':'›'}</button></div>
    <div class="sidebar-body">
      <section class="section"><div class="agent-card"><h3>Shared attention</h3><p>The browser agent can read the same filters, selections, hypotheses, evidence, graph, and visual dimensions you manipulate here.</p>${agentSuggestions(s).map(p=>`<button class="prompt-chip" data-copy-prompt="${e(p)}">${e(p)}</button>`).join('')}</div></section>
      <section class="section">
        <div class="section-head"><span class="section-label">What you can do</span></div>
        <div class="affordance-box">
          <div class="affordance-item"><strong>Drag-select points</strong> on scatter/timeline to isolate cohorts</div>
          <div class="affordance-item"><strong>Click records/evidence</strong> to inspect raw data and documents</div>
          <div class="affordance-item"><strong>Add filters</strong> to test subsets and boundary conditions</div>
          <div class="affordance-item"><strong>Challenge hypotheses</strong> by forking or attaching counterevidence</div>
        </div>
      </section>
      <section class="section"><div class="section-head"><span class="section-label">Current attention</span></div>
        <div class="kv"><span>Selected</span><strong>${s.selection.length}</strong></div>
        <div class="kv"><span>Filters</span><strong>${s.filters.length}</strong></div>
        <div class="kv"><span>Hypotheses</span><strong>${s.hypotheses.length}</strong></div>
        <div class="kv"><span>Annotations</span><strong>${s.annotations.length}</strong></div>
      </section>
      <section class="section"><div class="section-head"><span class="section-label">Recent activity</span><span class="section-sublabel">Full history in Provenance</span></div><div class="activity-list">${s.activity.slice(0,5).map(a=>`<div class="activity-item ${a.source==='agent'?'agent':''} ${a.kind==='error'?'error':''}"><div class="activity-meta"><span>${e(a.source)} · ${e(a.kind)}</span><span>${e(timeShort(a.at))}</span></div><div class="activity-text">${e(a.text)}</div></div>`).join('')}</div></section>
    </div>
  </aside>`;
}

function renderContextbar(s) {
  const visible = store.getVisibleRecords();
  return `<div class="contextbar"><div class="context-stat"><strong>${visible.length.toLocaleString()}</strong><span>visible</span></div><div class="context-stat"><strong>${s.selection.length.toLocaleString()}</strong><span>selected</span></div><div class="context-stat"><strong>${s.hypotheses.filter(h=>h.status!=='rejected').length}</strong><span>live hypotheses</span></div><div class="context-stat"><strong>${s.dataset.documents.filter(d=>d.trust==='untrusted').length}</strong><span>untrusted sources</span></div>${s.selection.length?`<div class="selection-banner">Shared selection: ${s.selection.length} ${e(s.dataset.recordLabel)}${s.selection.length===1?'':'s'} <button class="btn ghost" id="clear-selection">Clear</button></div>`:''}</div>`;
}

function renderKpis(s, records) {
  const fields = s.dataset.numericFields.slice(0,4);
  return `<div class="grid overview">${fields.map((f,i)=>{
    const avg = mean(records, f);
    const allAvg = mean(s.dataset.records, f);
    const delta = avg !== null && allAvg !== null ? avg - allAvg : null;
    return metricCard(label(f), avg===null?'—':formatNumber(avg), delta===null?'No numeric data':`${delta>=0?'+':''}${formatNumber(delta)} vs all records`, palette[i%palette.length]);
  }).join('')}</div>`;
}

function scatterSvg(s, records) {
  const xField = s.dimensions.x, yField = s.dimensions.y, colorField = s.dimensions.color;
  const [xmin,xmax] = extent(records,xField), [ymin,ymax] = extent(records,yField);
  const W=760,H=300, L=48,R=16,T=14,B=34;
  const xSpan=(xmax-xmin)||1, ySpan=(ymax-ymin)||1;
  const sx=v=>L+(Number(v)-xmin)/xSpan*(W-L-R);
  const sy=v=>T+(1-(Number(v)-ymin)/ySpan)*(H-T-B);
  const colors = groupCounts(records,colorField).slice(0,8).map(x=>x.value);
  const selected = new Set(s.selection);
  const circles = records.slice(0,1800).map(r=>{
    const x=safeNumber(r[xField]), y=safeNumber(r[yField]); if(x===null||y===null)return '';
    const sel=selected.has(r.id); const muted=selected.size&&!sel;
    const rad = sel?4.3:2.8;
    return `<circle class="point ${sel?'selected':''} ${muted?'muted':''}" role="button" tabindex="0" aria-label="Select record ${e(r.id)}" data-record-id="${e(r.id)}" data-cx="${sx(x)}" data-cy="${sy(y)}" cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="${rad}" fill="${colorFor(r[colorField],colors)}"><title>${e(r.id)} · ${e(label(xField))} ${e(formatNumber(x))} · ${e(label(yField))} ${e(formatNumber(y))}</title></circle>`;
  }).join('');
  const ticks = Array.from({length:5},(_,i)=>i/4);
  return `<svg id="scatter-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Scatter plot"><g>${ticks.map(t=>{const x=L+t*(W-L-R);const v=xmin+t*(xmax-xmin);return `<line class="grid-line" x1="${x}" x2="${x}" y1="${T}" y2="${H-B}"/><text class="axis-label" x="${x}" y="${H-13}" text-anchor="middle">${e(formatNumber(v))}</text>`}).join('')}${ticks.map(t=>{const y=T+(1-t)*(H-T-B);const v=ymin+t*(ymax-ymin);return `<line class="grid-line" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text class="axis-label" x="${L-7}" y="${y+3}" text-anchor="end">${e(formatNumber(v))}</text>`}).join('')}<line class="axis-line" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}"/><line class="axis-line" x1="${L}" x2="${L}" y1="${T}" y2="${H-B}"/>${circles}<rect id="scatter-brush" class="brush-rect" width="0" height="0" visibility="hidden"/></g></svg>`;
}

function renderScatter(s, records) {
  const fields = s.dataset.numericFields;
  const colors = groupCounts(records,s.dimensions.color).slice(0,8).map(x=>x.value);
  const sampling = records.length > 1800 ? ` · displaying first 1,800 of ${records.length.toLocaleString()}` : '';
  return `<div class="card chart-card"><div class="card-head"><div><div class="card-title">Linked scatter</div><div class="card-subtitle">Visual correlation and cohort isolation: drag-select or click points to coordinate attention across all views${e(sampling)}</div></div><div class="card-actions"><select class="field-select" data-dim="x">${fields.map(f=>`<option value="${e(f)}" ${s.dimensions.x===f?'selected':''}>x: ${e(label(f))}</option>`).join('')}</select><select class="field-select" data-dim="y">${fields.map(f=>`<option value="${e(f)}" ${s.dimensions.y===f?'selected':''}>y: ${e(label(f))}</option>`).join('')}</select></div></div><div class="card-body"><div class="legend">${colors.map(v=>`<div class="legend-item"><i class="legend-swatch" style="background:${colorFor(v,colors)}"></i>${e(v)}</div>`).join('')}</div><div class="chart-wrap">${scatterSvg(s,records)}</div></div></div>`;
}

function renderTimeline(s, records) {
  const timeField=s.dimensions.time, yField=s.dimensions.y;
  if(!timeField) return `<div class="card"><div class="card-head"><div class="card-title">Timeline</div></div><div class="empty">No timestamp field detected</div></div>`;
  const timed=records.filter(r=>!Number.isNaN(Date.parse(r[timeField]))&&safeNumber(r[yField])!==null).sort((a,b)=>Date.parse(a[timeField])-Date.parse(b[timeField]));
  if(!timed.length) return `<div class="card"><div class="card-head"><div class="card-title">Timeline</div></div><div class="empty">No plottable timeline data</div></div>`;
  const W=600,H=220,L=44,R=12,T=14,B=30;
  const tmin=Date.parse(timed[0][timeField]), tmax=Date.parse(timed[timed.length-1][timeField])||tmin+1;
  const [ymin,ymax]=extent(timed,yField); const ySpan=(ymax-ymin)||1; const sx=v=>L+(Date.parse(v)-tmin)/(tmax-tmin||1)*(W-L-R); const sy=v=>T+(1-(Number(v)-ymin)/ySpan)*(H-T-B);
  const step=Math.max(1,Math.floor(timed.length/220)); const sampled=timed.filter((_,i)=>i%step===0||i===timed.length-1);
  const path=sampled.map((r,i)=>`${i?'L':'M'}${sx(r[timeField]).toFixed(1)},${sy(r[yField]).toFixed(1)}`).join(' ');
  const selected=new Set(s.selection);
  return `<div class="card"><div class="card-head"><div><div class="card-title">Timeline</div><div class="card-subtitle">${e(label(yField))} over ${e(label(timeField))}</div></div></div><div class="card-body"><div class="chart-wrap small"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line class="axis-line" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}"/><path d="${path}" fill="none" stroke="#7aa2ff" stroke-width="1.8" opacity=".8"/>${sampled.map(r=>`<circle class="point ${selected.has(r.id)?'selected':''} ${selected.size&&!selected.has(r.id)?'muted':''}" role="button" tabindex="0" aria-label="Select record ${e(r.id)}" data-record-id="${e(r.id)}" cx="${sx(r[timeField]).toFixed(1)}" cy="${sy(r[yField]).toFixed(1)}" r="${selected.has(r.id)?3.6:2.1}" fill="${r.severity==='critical'?'#ff7d85':r.severity==='warning'?'#f4c96b':'#7aa2ff'}"><title>${e(timeShort(r[timeField]))} · ${e(label(yField))}: ${e(formatNumber(r[yField]))}</title></circle>`).join('')}<text class="axis-label" x="${L}" y="${H-10}">${e(timeShort(timed[0][timeField]))}</text><text class="axis-label" x="${W-R}" y="${H-10}" text-anchor="end">${e(timeShort(timed[timed.length-1][timeField]))}</text></svg></div></div></div>`;
}

function renderTable(s, records) {
  const selected=new Set(s.selection);
  const columns=['id',s.dimensions.time,...s.dataset.keyFields.slice(0,4),...s.dataset.numericFields.slice(0,4)].filter(Boolean);
  const uniqueCols=[...new Set(columns)];
  return `<div class="card"><div class="card-head"><div><div class="card-title">Evidence table</div><div class="card-subtitle">Showing first ${Math.min(200,records.length)} of ${records.length} visible records</div></div></div><div class="card-body"><div class="table-wrap"><table><thead><tr>${uniqueCols.map(c=>`<th>${e(label(c))}</th>`).join('')}</tr></thead><tbody>${records.slice(0,200).map(r=>`<tr role="button" tabindex="0" aria-label="Select record ${e(r.id)}" data-row-id="${e(r.id)}" class="${selected.has(r.id)?'selected-row':''} ${s.focusedRecordId===r.id?'focused-row':''}">${uniqueCols.map(c=>`<td>${c==='severity'?`<span class="severity ${e(r[c])}">${e(r[c])}</span>`:c===s.dimensions.time?e(timeShort(r[c])):e(formatNumber(r[c]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></div>`;
}

function renderGraph(s) {
  const {nodes,edges}=s.dataset.graph;
  if(!nodes.length) return `<div class="card"><div class="card-head"><div class="card-title">Relationship graph</div></div><div class="empty">No relationship graph imported</div></div>`;
  const W=520,H=310,cx=W/2,cy=H/2,rx=185,ry=110;
  const pos=new Map(nodes.map((n,i)=>[n.id,{x:cx+Math.cos((i/nodes.length)*Math.PI*2-Math.PI/2)*rx,y:cy+Math.sin((i/nodes.length)*Math.PI*2-Math.PI/2)*ry}]));
  return `<div class="card"><div class="card-head"><div><div class="card-title">Relationship graph</div><div class="card-subtitle">Entities and evidence relationships</div></div></div><div class="card-body"><div class="graph-wrap"><svg viewBox="0 0 ${W} ${H}">${edges.map(ed=>{const a=pos.get(ed.source),b=pos.get(ed.target);if(!a||!b)return'';const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;return `<line class="graph-edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><text class="graph-edge-label" x="${mx}" y="${my-4}" text-anchor="middle">${e(ed.label)}</text>`}).join('')}${nodes.map(n=>{const p=pos.get(n.id);return `<g class="graph-node ${s.focusedGraphNodeId===n.id?'focused':''}" role="button" tabindex="0" aria-label="Focus graph node ${e(n.label)}" data-node-id="${e(n.id)}"><circle cx="${p.x}" cy="${p.y}" r="27"/><text x="${p.x}" y="${p.y-2}" text-anchor="middle">${e(n.label.length>16?n.label.slice(0,15)+'…':n.label)}</text><text class="axis-label" x="${p.x}" y="${p.y+10}" text-anchor="middle">${e(n.type)}</text></g>`}).join('')}</svg></div></div></div>`;
}

function renderSelectionAnalysis(s, records) {
  if (!s.selection.length) return '';
  const ids = new Set(s.selection);
  const a = s.dataset.records.filter(r => ids.has(r.id));
  const b = records.filter(r => !ids.has(r.id));
  if (!a.length || !b.length) return '';
  const features = rankDiscriminatingFeatures(a, b, s.dataset.numericFields, s.dataset.keyFields).slice(0, 6);
  return `<div class="card" style="margin-bottom:10px"><div class="card-head"><div><div class="card-title">Why this selection is different</div><div class="card-subtitle">Live comparison of ${a.length} selected records against ${b.length} other visible records</div></div></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:7px">${features.map(f => {
    if (f.type === 'numeric') {
      const d=f.detail;
      return `<div class="saved-item"><div class="saved-item-title">${e(label(f.field))}</div><div class="saved-item-meta">selected ${e(formatNumber(d.aMean))} · rest ${e(formatNumber(d.bMean))}</div><div style="font-size:10px;margin-top:5px;color:${d.delta>=0?'var(--green)':'var(--red)'}">${d.delta>=0?'+':''}${e(formatNumber(d.delta))} mean delta</div></div>`;
    }
    const d=f.detail;
    return `<button class="saved-item" style="text-align:left;color:inherit" data-feature-filter-field="${e(f.field)}" data-feature-filter-value="${e(f.value)}"><div class="saved-item-title">${e(label(f.field))}: ${e(f.value)}</div><div class="saved-item-meta">${Math.round(d.aShare*100)}% selected · ${Math.round(d.bShare*100)}% rest</div><div style="font-size:10px;margin-top:5px;color:var(--accent-2)">Click to filter this value</div></button>`;
  }).join('')}</div></div></div>`;
}

function renderSignals(s, records) {
  const target = s.dimensions.y;
  const correlations = rankCorrelations(records, target, s.dataset.numericFields).slice(0, 4);
  const categories = groupCounts(records, s.dimensions.color).slice(0, 6);
  const outliers = findOutliers(records, target, 2).slice(0, 5);
  const maxCount = Math.max(1, ...categories.map(x => x.count));
  return `<div class="card"><div class="card-head"><div><div class="card-title">Investigation signals</div><div class="card-subtitle">Fast, transparent leads from the currently visible data</div></div></div><div class="card-body"><div class="signals-grid">
    <div><div class="section-label" style="margin-bottom:7px">Correlated with ${e(label(target))}</div>${correlations.length?correlations.map(c=>`<button class="saved-item" style="width:100%;text-align:left;color:inherit" data-signal-x="${e(c.field)}"><div class="saved-item-title">${e(label(c.field))}</div><div class="saved-item-meta">r = ${e(c.correlation.toFixed(3))}</div></button>`).join(''):'<div class="empty" style="padding:8px">Not enough numeric fields</div>'}</div>
    <div><div class="section-label" style="margin-bottom:7px">${e(label(s.dimensions.color))} concentration</div>${categories.map(c=>`<button class="saved-item" style="width:100%;text-align:left;color:inherit" data-feature-filter-field="${e(s.dimensions.color)}" data-feature-filter-value="${e(c.value)}"><div style="display:flex;justify-content:space-between;gap:8px"><span class="saved-item-title">${e(c.value)}</span><span class="saved-item-meta">${c.count}</span></div><div style="height:3px;background:#222b35;border-radius:3px;margin-top:6px;overflow:hidden"><i style="display:block;height:100%;width:${Math.max(2,c.count/maxCount*100)}%;background:var(--accent)"></i></div></button>`).join('')}</div>
    <div><div class="section-label" style="margin-bottom:7px">${e(label(target))} outliers</div>${outliers.length?outliers.map(o=>`<button class="saved-item" style="width:100%;text-align:left;color:inherit" data-focus-outlier="${e(o.record.id)}"><div class="saved-item-title">${e(o.record.id)}</div><div class="saved-item-meta">z = ${e(o.z.toFixed(2))} · ${e(formatNumber(o.record[target]))}</div></button>`).join(''):'<div class="empty" style="padding:8px">No ≥2σ outliers</div>'}</div>
  </div></div></div>`;
}

function renderExplore(s) {
  const records=store.getVisibleRecords();
  return `${renderKpis(s,records)}<div class="grid analysis">${renderScatter(s,records)}${renderTimeline(s,records)}</div><div style="margin-top:10px">${renderSelectionAnalysis(s,records)}${renderSignals(s,records)}</div><div class="grid bottom">${renderTable(s,records)}${renderGraph(s)}</div>`;
}

function evidenceName(s,id){return s.dataset.documents.find(d=>d.id===id)?.title||id;}
function renderHypotheses(s) {
  return `<div class="page-heading hypothesis-heading"><div><div style="font-size:15px;font-weight:760">Competing hypotheses</div><div class="card-subtitle">Falsification framework: track competing explanations, confidence scores, and counterevidence side-by-side as the investigation evolves.</div></div><button class="btn primary" id="add-hypothesis">New hypothesis</button></div><div class="hypothesis-grid">${s.hypotheses.map(h=>`<article class="hypothesis-card"><div class="hypothesis-head"><div><div class="hypothesis-title">${e(h.title)}</div><div style="margin-top:7px"><span class="status ${e(h.status)}">${e(h.status)}</span></div></div><div class="confidence"><strong>${Math.round(h.confidence)}%</strong><span>confidence</span></div></div><div class="confidence-bar"><i style="width:${Math.max(4,h.confidence)}%"></i></div><div class="hypothesis-body"><div class="hypothesis-notes">${e(h.notes||'No reasoning notes recorded')}</div>${h.questions?.length?`<div class="field-group"><span class="field-label">Falsification questions</span><ul class="question-list">${h.questions.map(q=>`<li>${e(q)}</li>`).join('')}</ul></div>`:''}<div class="field-group"><span class="field-label">Supporting evidence (${h.supporting?.length||0})</span><div class="chip-row">${(h.supporting||[]).map(id=>`<button class="evidence-chip" data-focus-doc="${e(id)}">${e(evidenceName(s,id))}</button>`).join('')||'<span class="empty-note">None attached</span>'}</div></div><div class="field-group"><span class="field-label">Contradicting evidence (${h.contradicting?.length||0})</span><div class="chip-row">${(h.contradicting||[]).map(id=>`<button class="evidence-chip contradicting" data-focus-doc="${e(id)}">${e(evidenceName(s,id))}</button>`).join('')||'<span class="empty-note">None attached</span>'}</div></div></div><div class="hypothesis-actions"><button class="btn ghost" data-edit-hypothesis="${e(h.id)}">Edit</button><button class="btn ghost" data-attach-evidence="${e(h.id)}">Attach evidence</button><button class="btn ghost" data-fork-hypothesis="${e(h.id)}">Fork alternative</button><button class="btn ghost" data-find-counterevidence="${e(h.id)}">Find counterevidence</button></div></article>`).join('')}</div>`;
}

function renderEvidence(s) {
  const focused=s.focusedDocumentId?s.dataset.documents.find(d=>d.id===s.focusedDocumentId):null;
  return `<div class="page-heading evidence-heading"><div><div style="font-size:15px;font-weight:760">Evidence library</div><div class="card-subtitle">Auditable ground truth: raw documents, release notes, and telemetry distinct from model reasoning. Untrusted evidence is explicitly marked for WebMCP agents.</div></div><input class="search evidence-search" id="evidence-search" value="${e(evidenceSearch)}" placeholder="Search documents" /></div>${focused?`<div class="card" style="margin-bottom:10px"><div class="card-head"><div><div class="card-title">${e(focused.title)}</div><div class="card-subtitle">${e(focused.source)} · ${e(focused.type)} · ${e(timeShort(focused.timestamp))}</div></div><span class="trust ${focused.trust==='untrusted'?'untrusted':''}">${e(focused.trust)}</span></div><div class="card-body"><div class="doc-body">${focused.mediaType?renderEvidenceMedia(focused):''}<div class="doc-text">${e(focused.content)}</div>${focused.tags?.length?`<div class="chip-row" style="margin-top:10px">${focused.tags.map(t=>`<span class="tag-chip">#${e(t)}</span>`).join('')}</div>`:''}</div></div></div>`:''}<div class="evidence-grid">${s.dataset.documents.map(d=>`<article class="card evidence-card ${s.focusedDocumentId===d.id?'focused-card':''}" role="button" tabindex="0" aria-label="Open evidence document ${e(d.title)}" data-doc-id="${e(d.id)}" data-doc-search="${e(`${d.title} ${d.source} ${d.type} ${d.content} ${(d.tags||[]).join(' ')}`.toLowerCase())}"><div class="card-head"><div><div class="card-title">${e(d.title)}</div><div class="card-subtitle">${e(d.source)} · ${e(d.type)}</div></div><span class="trust ${d.trust==='untrusted'?'untrusted':''}">${e(d.trust)}</span></div><div class="card-body"><p class="line-clamp">${e(d.content)}</p>${d.mediaType?`<div class="media-badge">Media: ${e(d.mediaType)}</div>`:''}<div class="meta-row" style="margin-top:8px"><span>${e(timeShort(d.timestamp))}</span>${d.tags?.length?`<span>#${e(d.tags[0])}</span>`:''}</div></div></article>`).join('')}</div>`;
}

function renderProvenance(s) {
  return `<div class="grid analysis"><div class="card"><div class="card-head"><div><div class="card-title">Investigation provenance</div><div class="card-subtitle">Auditable human + agent action trail</div></div></div><div class="card-body"><div class="activity-list">${s.activity.map(a=>`<div class="activity-item ${a.source==='agent'?'agent':''} ${a.kind==='error'?'error':''}"><div class="activity-meta"><span>${e(a.source)} · ${e(a.kind)}</span><span>${e(timeShort(a.at))}</span></div><div class="activity-text">${e(a.text)}</div></div>`).join('')}</div></div></div><div><div class="card" style="margin-bottom:10px"><div class="card-head"><div class="card-title">Annotations</div><button class="btn" id="add-annotation">Add</button></div><div class="card-body">${s.annotations.length?s.annotations.map(a=>`<div class="annotation"><div class="annotation-meta">${e(a.tone||'note')} · ${e(a.targetType||'workspace')} ${e(a.targetId||'')}</div><div class="annotation-text">${e(a.text)}</div></div>`).join(''):'<div class="empty">No annotations yet</div>'}</div></div><div class="card"><div class="card-head"><div class="card-title">WebMCP surface</div></div><div class="card-body"><div class="kv"><span>Status</span><strong>${s.webmcp.available?'available':'browser unsupported'}</strong></div><div class="kv"><span>Registered tools</span><strong>${s.webmcp.registered}</strong></div><div class="kv"><span>Read/write tools</span><strong>${createWebMcpTools(store).length}</strong></div><button class="btn" id="show-tools" style="width:100%;margin-top:8px">Inspect tool catalog</button></div></div></div></div>`;
}

function renderMain(s) {
  const content=s.activeTab==='canvas'?renderSpatialCanvas(s,store):s.activeTab==='hypotheses'?renderHypotheses(s):s.activeTab==='evidence'?renderEvidence(s):s.activeTab==='provenance'?renderProvenance(s):renderExplore(s);
  return `<main class="main">${renderContextbar(s)}<div class="content">${content}</div></main>`;
}

function render() {
  const s=store.state;
  const scroll = captureViewportScroll();
  let active = null;
  if (root.contains(document.activeElement) && document.activeElement.id) {
    let start = null, end = null;
    try {
      start = document.activeElement.selectionStart;
      end = document.activeElement.selectionEnd;
    } catch {}
    active = { id: document.activeElement.id, start, end };
  }
  root.innerHTML=`<div class="app-shell">${renderTopbar(s)}<div class="workspace ${s.ui.leftCollapsed?'left-collapsed':''} ${s.ui.rightCollapsed?'right-collapsed':''}">${renderSidebar(s)}${renderMain(s)}${renderRightbar(s)}</div></div>`;
  if(modal && !document.querySelector('.modal-backdrop')) renderModal();
  bindEvents();
  const evidenceInput = document.querySelector('#evidence-search');
  if (evidenceInput) {
    const query = evidenceSearch.toLowerCase();
    document.querySelectorAll('[data-doc-search]').forEach((card) => card.classList.toggle('hidden', !card.dataset.docSearch.includes(query)));
  }
  if (active) {
    const replacement = document.getElementById(active.id);
    if (replacement) {
      replacement.focus({ preventScroll: true });
      if (typeof replacement.setSelectionRange === 'function' && active.start !== null) {
        try { replacement.setSelectionRange(active.start, active.end); } catch {}
      }
    }
  }
  scheduleViewportRestore(scroll);
}

function showModal(kind,data={}) {
  if (!modalReturnFocus || !document.body.contains(modalReturnFocus)) {
    modalReturnFocus = document.activeElement;
  }
  modal = { kind, data };
  renderModal();
}
function closeModal(){
  const target = modalReturnFocus;
  modal = null;
  modalReturnFocus = null;
  document.querySelector('.modal-backdrop')?.remove();
  if (target) {
    if (document.body.contains(target)) {
      target.focus?.();
    } else if (target.id && document.getElementById(target.id)) {
      document.getElementById(target.id).focus();
    } else if (target.dataset) {
      const match = Object.entries(target.dataset).find(([k, v]) => v);
      if (match) {
        const attr = match[0].replace(/([A-Z])/g, '-$1').toLowerCase();
        const el = document.querySelector(`[data-${attr}="${CSS.escape(match[1])}"]`);
        el?.focus?.();
      }
    }
  }
}
function renderModal(){
  document.querySelector('.modal-backdrop')?.remove(); if(!modal)return;
  const wrap=document.createElement('div');wrap.className='modal-backdrop';
  if(modal.kind==='hypothesis'){
    const h=modal.data.h||{};
    wrap.innerHTML=`<div class="modal"><div class="modal-head"><h2>${h.id?'Edit':'Create'} hypothesis</h2><button class="btn icon ghost" data-close-modal aria-label="Close dialog">×</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label for="hyp-title">Falsifiable statement</label><textarea id="hyp-title">${e(h.title||'')}</textarea></div><div class="form-grid two"><div class="field"><label for="hyp-confidence">Confidence 0–100</label><input id="hyp-confidence" type="number" min="0" max="100" value="${e(h.confidence??50)}" /></div><div class="field"><label for="hyp-status">Status</label><select id="hyp-status">${['testing','supported','weakened','rejected','unresolved'].map(x=>`<option ${h.status===x?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="field"><label for="hyp-questions">Questions that could falsify it (one per line)</label><textarea id="hyp-questions">${e((h.questions||[]).join('\n'))}</textarea></div><div class="field"><label for="hyp-notes">Reasoning note</label><textarea id="hyp-notes">${e(h.notes||'')}</textarea></div></div><div class="modal-actions"><button class="btn ghost" data-close-modal>Cancel</button><button class="btn primary" id="save-hypothesis">Save hypothesis</button></div></div></div>`;
  } else if(modal.kind==='attach'){
    const h=store.state.hypotheses.find(x=>x.id===modal.data.hypothesisId);
    wrap.innerHTML=`<div class="modal"><div class="modal-head"><h2>Attach evidence</h2><button class="btn icon ghost" data-close-modal aria-label="Close dialog">×</button></div><div class="modal-body"><div class="field"><span class="field-label">Hypothesis</span><div style="font-size:12px">${e(h?.title||'')}</div></div><div class="field" style="margin-top:10px"><label for="attach-doc">Evidence document</label><select id="attach-doc">${store.state.dataset.documents.map(d=>`<option value="${e(d.id)}">${e(d.title)}</option>`).join('')}</select></div><div class="field" style="margin-top:10px"><label for="attach-stance">Stance</label><select id="attach-stance"><option value="supporting">Supporting</option><option value="contradicting">Contradicting</option></select></div><div class="modal-actions"><button class="btn ghost" data-close-modal>Cancel</button><button class="btn primary" id="save-attach">Attach</button></div></div></div>`;
  } else if(modal.kind==='annotation'){
    wrap.innerHTML=`<div class="modal"><div class="modal-head"><h2>Add annotation</h2><button class="btn icon ghost" data-close-modal aria-label="Close dialog">×</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label for="ann-target">Target</label><select id="ann-target"><option>workspace</option><option>selection</option><option>record</option><option>document</option><option>graph-node</option><option>hypothesis</option></select></div><div class="field"><label for="ann-id">Target ID (optional)</label><input id="ann-id" /></div><div class="field"><label for="ann-text">Annotation</label><textarea id="ann-text"></textarea></div><div class="field"><label for="ann-tone">Tone</label><select id="ann-tone"><option>finding</option><option>question</option><option>warning</option><option>note</option></select></div></div><div class="modal-actions"><button class="btn ghost" data-close-modal>Cancel</button><button class="btn primary" id="save-annotation">Add annotation</button></div></div></div>`;
  } else if(modal.kind==='tools'){
    const tools=createWebMcpTools(store);
    wrap.innerHTML=`<div class="modal"><div class="modal-head"><h2>WebMCP tool catalog (${tools.length})</h2><button class="btn icon ghost" data-close-modal aria-label="Close dialog">×</button></div><div class="modal-body">${tools.map(t=>`<div class="saved-item"><div class="saved-item-title"><code>${e(t.name)}</code> <span class="status">${t.annotations?.readOnlyHint?'read':'write'}</span>${t.annotations?.untrustedContentHint?'<span class="status weakened" style="margin-left:4px">untrusted output</span>':''}</div><div class="saved-item-meta" style="line-height:1.4">${e(t.description)}</div></div>`).join('')}</div></div>`;
  } else if(modal.kind==='api'){
    wrap.innerHTML=`<div class="modal"><div class="modal-head"><h2>Connect a public JSON API</h2><button class="btn icon ghost" data-close-modal aria-label="Close dialog">×</button></div><div class="modal-body"><p class="modal-copy">Load a read-only HTTPS endpoint directly into this browser. No credentials, cookies, or tokens are sent. The API must allow browser CORS requests.</p><div class="form-grid"><div class="field"><label for="api-url">HTTPS endpoint</label><input id="api-url" type="url" required placeholder="https://api.example.com/events" /></div><div class="form-grid two"><div class="field"><label for="api-records-path">Records path (optional)</label><input id="api-records-path" placeholder="data.items" /></div><div class="field"><label for="api-title">Dataset title (optional)</label><input id="api-title" placeholder="Production events" /></div></div><div id="api-error" class="form-error" role="alert"></div></div><div class="modal-actions"><button class="btn ghost" data-close-modal>Cancel</button><button class="btn primary" id="load-api">Load API snapshot</button></div></div></div>`;
  }
  const dialog=wrap.querySelector('.modal');
  const heading=dialog?.querySelector('h2');
  if(dialog){dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');if(heading){heading.id='modal-title';dialog.setAttribute('aria-labelledby','modal-title');}}
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));
  wrap.addEventListener('click',ev=>{if(ev.target===wrap)closeModal();});
  wrap.addEventListener('keydown',(event)=>{
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if(event.key!=='Tab')return;
    const focusable=[...wrap.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((element)=>!element.disabled);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){
      event.preventDefault();
      last.focus();
    }else if(!event.shiftKey&&document.activeElement===last){
      event.preventDefault();
      first.focus();
    }
  });
  wrap.querySelector('#save-hypothesis')?.addEventListener('click',()=>{const input={title:document.querySelector('#hyp-title').value.trim(),confidence:Number(document.querySelector('#hyp-confidence').value),status:document.querySelector('#hyp-status').value,questions:document.querySelector('#hyp-questions').value.split('\n').map(x=>x.trim()).filter(Boolean),notes:document.querySelector('#hyp-notes').value.trim()};if(!input.title)return toast('Hypothesis needs a statement'); if(modal.data.h?.id)store.updateHypothesis(modal.data.h.id,input);else store.addHypothesis(input);closeModal();});
  wrap.querySelector('#save-attach')?.addEventListener('click',()=>{store.attachEvidence(modal.data.hypothesisId,document.querySelector('#attach-doc').value,document.querySelector('#attach-stance').value);closeModal();});
  wrap.querySelector('#save-annotation')?.addEventListener('click',()=>{const text=document.querySelector('#ann-text').value.trim();if(!text)return;store.addAnnotation({targetType:document.querySelector('#ann-target').value,targetId:document.querySelector('#ann-id').value.trim(),text,tone:document.querySelector('#ann-tone').value});closeModal();});
  wrap.querySelector('#load-api')?.addEventListener('click',async()=>{
    const button=wrap.querySelector('#load-api'), error=wrap.querySelector('#api-error');
    const url=wrap.querySelector('#api-url').value.trim();
    if(!url){error.textContent='Enter an HTTPS endpoint.';return;}
    button.disabled=true;button.textContent='Loading…';error.textContent='';
    try{
      const result=await loadPublicApiSource({url,recordsPath:wrap.querySelector('#api-records-path').value.trim(),title:wrap.querySelector('#api-title').value.trim()});
      store.loadCustomDataset(result.dataset);closeModal();toast(`Loaded ${result.dataset.records.length.toLocaleString()} API records`);
    }catch(loadError){error.textContent=loadError.message;button.disabled=false;button.textContent='Load API snapshot';}
  });
  const initialFocus = wrap.querySelector('.modal-body input, .modal-body textarea, .modal-body select, .modal-body button, [tabindex]:not([tabindex="-1"])') || wrap.querySelector('textarea, input, select, button');
  initialFocus?.focus();
}

function bindEvents(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>store.mutate(s=>{s.activeTab=b.dataset.tab;},{history:false})));
  document.querySelector('#toggle-left')?.addEventListener('click',()=>store.mutate(s=>{s.ui.leftCollapsed=!s.ui.leftCollapsed;},{history:false}));
  document.querySelector('#toggle-right')?.addEventListener('click',()=>store.mutate(s=>{s.ui.rightCollapsed=!s.ui.rightCollapsed;},{history:false}));
  document.querySelector('#undo-btn')?.addEventListener('click',()=>store.undo()||toast('Nothing to undo'));
  document.querySelector('#redo-btn')?.addEventListener('click',()=>store.redo()||toast('Nothing to redo'));
  document.querySelector('#dataset-switcher')?.addEventListener('change',ev=>{if(!SAMPLE_DATASETS.some(d=>d.id===ev.target.value))return;if(store.hasWorkspaceChanges()&&!confirm('Switch datasets and discard the current workspace changes?')){ev.target.value=store.state.dataset.id;return;}closeModal();evidenceSearch='';store.loadDataset(ev.target.value)});
  document.querySelector('#global-search')?.addEventListener('keydown',ev=>{if(ev.key==='Enter')store.setSearch(ev.target.value)});
  document.querySelector('#clear-filters')?.addEventListener('click',()=>store.clearFilters());
  document.querySelectorAll('[data-remove-filter]').forEach(b=>b.addEventListener('click',()=>store.removeFilter(b.dataset.removeFilter)));
  document.querySelector('#quick-filter-add')?.addEventListener('click',()=>{const field=document.querySelector('#quick-filter-field').value;const value=document.querySelector('#quick-filter-value').value;const op=document.querySelector('#quick-filter-op').value;if(value!=='')store.addFilter({field,op,value});});
  document.querySelector('#clear-selection')?.addEventListener('click',()=>store.clearSelection());
  document.querySelectorAll('[data-feature-filter-field]').forEach(b=>b.addEventListener('click',()=>store.addFilter({field:b.dataset.featureFilterField,op:'eq',value:b.dataset.featureFilterValue})));
  document.querySelectorAll('[data-signal-x]').forEach(b=>b.addEventListener('click',()=>store.setDimension('x',b.dataset.signalX)));
  document.querySelectorAll('[data-focus-outlier]').forEach(b=>b.addEventListener('click',()=>store.setSelection([b.dataset.focusOutlier])));
  document.querySelector('#save-view')?.addEventListener('click',()=>{const name=prompt('View name');if(name)store.saveView(name)});
  document.querySelector('#new-branch')?.addEventListener('click',()=>{const name=prompt('Branch name');if(name)store.createBranch(name)});
  document.querySelectorAll('[data-restore-view]').forEach(el=>el.addEventListener('click',()=>store.restoreView(el.dataset.restoreView)));
  document.querySelectorAll('[data-restore-branch]').forEach(el=>el.addEventListener('click',()=>store.restoreBranch(el.dataset.restoreBranch)));
  document.querySelectorAll('[data-dim]').forEach(sel=>sel.addEventListener('change',()=>store.setDimension(sel.dataset.dim,sel.value)));
  document.querySelectorAll('[data-row-id]').forEach(row=>row.addEventListener('click',ev=>{store.state.focusedRecordId=row.dataset.rowId;store.toggleSelection(row.dataset.rowId,ev.ctrlKey||ev.metaKey||ev.shiftKey);}));
  document.querySelectorAll('.point[data-record-id]').forEach(pt=>{
    pt.addEventListener('pointerdown',()=>{pointPointerScroll=captureViewportScroll();});
    pt.addEventListener('click',ev=>{
      ev.stopPropagation();
      ev.preventDefault();
      const scroll=pointPointerScroll || captureViewportScroll();
      pointPointerScroll=null;
      store.state.focusedRecordId=pt.dataset.recordId;
      store.toggleSelection(pt.dataset.recordId,ev.ctrlKey||ev.metaKey||ev.shiftKey);
      scheduleViewportRestore(scroll);
    });
    pt.addEventListener('keydown',ev=>{
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        const scroll=captureViewportScroll();
        store.state.focusedRecordId=pt.dataset.recordId;
        store.toggleSelection(pt.dataset.recordId,ev.ctrlKey||ev.metaKey||ev.shiftKey);
        scheduleViewportRestore(scroll);
      }
    });
  });
  bindScatterBrush();
  document.querySelectorAll('[data-node-id]').forEach(n=>n.addEventListener('click',()=>store.mutate(s=>{s.focusedGraphNodeId=n.dataset.nodeId;},{activity:{kind:'graph',text:`Focused graph node ${n.dataset.nodeId}`}})));
  document.querySelectorAll('[data-fork-hypothesis]').forEach(b=>b.addEventListener('click',()=>{const parent=store.state.hypotheses.find(h=>h.id===b.dataset.forkHypothesis);const title=prompt('Alternative hypothesis',parent?`${parent.title} — alternative`:'Alternative hypothesis');if(title)store.forkHypothesis(b.dataset.forkHypothesis,{title,forkReason:'Human-created alternative'});}));
  document.querySelectorAll('[data-find-counterevidence]').forEach(b=>b.addEventListener('click',()=>{const hits=store.discoverCounterevidence(b.dataset.findCounterevidence,6);if(!hits.length)return toast('No unattached counterevidence candidates found');const top=hits[0].document;store.mutate(s=>{s.focusedDocumentId=top.id;s.activeTab='evidence';},{history:false});toast(`Counterevidence candidate: ${top.title}`);}));
  bindSpatialCanvasEvents(store);
  document.querySelector('#add-hypothesis')?.addEventListener('click',()=>showModal('hypothesis'));
  document.querySelectorAll('[data-edit-hypothesis]').forEach(b=>b.addEventListener('click',()=>showModal('hypothesis',{h:store.state.hypotheses.find(h=>h.id===b.dataset.editHypothesis)})));
  document.querySelectorAll('[data-attach-evidence]').forEach(b=>b.addEventListener('click',()=>showModal('attach',{hypothesisId:b.dataset.attachEvidence})));
  document.querySelectorAll('[data-focus-doc]').forEach(b=>b.addEventListener('click',()=>store.mutate(s=>{s.focusedDocumentId=b.dataset.focusDoc;s.activeTab='evidence';},{history:false})));
  document.querySelectorAll('[data-doc-id]').forEach(d=>d.addEventListener('click',()=>store.mutate(s=>{s.focusedDocumentId=d.dataset.docId;},{history:false})));
  document.querySelector('#evidence-search')?.addEventListener('input',ev=>{evidenceSearch=ev.target.value;const q=evidenceSearch.toLowerCase();document.querySelectorAll('[data-doc-search]').forEach(card=>card.classList.toggle('hidden',!card.dataset.docSearch.includes(q)));});
  document.querySelector('#add-annotation')?.addEventListener('click',()=>showModal('annotation'));
  document.querySelector('#show-tools')?.addEventListener('click',()=>showModal('tools'));
  document.querySelectorAll('[data-copy-prompt]').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.copyPrompt);toast('Prompt copied — use it with the browser agent')}catch{toast(b.dataset.copyPrompt)}}));
  document.querySelector('#import-btn')?.addEventListener('click',()=>fileInput.click());
  document.querySelector('#api-btn')?.addEventListener('click',()=>showModal('api'));
  document.querySelector('#export-btn')?.addEventListener('click',()=>download(`investigation-${store.state.dataset.id}.json`,JSON.stringify(store.exportState(),null,2)));
  document.querySelectorAll('[data-restore-view],[data-restore-branch],[data-row-id],[data-node-id],[data-doc-id]').forEach((element)=>element.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();element.click();}}));
}

function bindScatterBrush(){
  const svg=document.querySelector('#scatter-svg'); if(!svg)return;
  const brush=svg.querySelector('#scatter-brush'); let start=null,moved=false;
  const coords=(ev)=>{const rect=svg.getBoundingClientRect();const vb=svg.viewBox.baseVal;return {x:(ev.clientX-rect.left)/rect.width*vb.width,y:(ev.clientY-rect.top)/rect.height*vb.height};};
  const cancelBrush=()=>{if(!start)return;start=null;moved=false;brush.setAttribute('visibility','hidden');window.removeEventListener('keydown',keydown);};
  const keydown=(e)=>{if(e.key==='Escape'&&start){e.preventDefault();cancelBrush();}};
  svg.addEventListener('pointerdown',ev=>{if(ev.target.classList.contains('point'))return;start=coords(ev);moved=false;svg.setPointerCapture(ev.pointerId);brush.setAttribute('visibility','visible');brush.setAttribute('x',start.x);brush.setAttribute('y',start.y);brush.setAttribute('width',0);brush.setAttribute('height',0);window.addEventListener('keydown',keydown);});
  svg.addEventListener('pointermove',ev=>{if(!start)return;const p=coords(ev);moved=true;brush.setAttribute('x',Math.min(start.x,p.x));brush.setAttribute('y',Math.min(start.y,p.y));brush.setAttribute('width',Math.abs(p.x-start.x));brush.setAttribute('height',Math.abs(p.y-start.y));});
  const finish=(ev)=>{if(!start)return;const p=coords(ev);brush.setAttribute('visibility','hidden');if(moved){const x1=Math.min(start.x,p.x),x2=Math.max(start.x,p.x),y1=Math.min(start.y,p.y),y2=Math.max(start.y,p.y);const ids=[...svg.querySelectorAll('.point[data-record-id]')].filter(pt=>{const x=Number(pt.dataset.cx),y=Number(pt.dataset.cy);return x>=x1&&x<=x2&&y>=y1&&y<=y2;}).map(pt=>pt.dataset.recordId);store.setSelection(ids);}start=null;window.removeEventListener('keydown',keydown);};
  svg.addEventListener('pointerup',finish);svg.addEventListener('pointercancel',cancelBrush);
}

fileInput.addEventListener('change',async()=>{const file=fileInput.files?.[0];if(!file)return;try{toast(`Reading ${file.name}…`);const result=await loadFileSource(file);if(result.type==='workspace')store.importState(result.payload);else store.loadCustomDataset(result.dataset);toast(`Imported ${file.name}`);}catch(error){toast(`Import failed: ${error.message}`)}finally{fileInput.value='';}});

document.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();ev.shiftKey?store.redo():store.undo();}if(ev.key==='Escape')closeModal();});

store.subscribe(render);
render();
registerWebMcp(store);
window.InvestigationCanvas={store,createWebMcpTools:()=>createWebMcpTools(store)};

if (typeof window !== 'undefined' && window.location) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') {
    import('./demo.js').then(({ initDemo }) => initDemo(store));
  }
}
