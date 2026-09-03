import { extent, formatNumber, groupCounts, rankDiscriminatingFeatures, safeNumber, buildReasoningGraph } from './core.js';

const esc = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const label = (field) => String(field || '—').replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_',' ').replace(/^./, (c) => c.toUpperCase());

function miniScatter(s, records) {
  const x=s.dimensions.x,y=s.dimensions.y; const [xmin,xmax]=extent(records,x),[ymin,ymax]=extent(records,y); const selected=new Set(s.selection);
  const pts=records.slice(0,500).map(r=>{const xv=safeNumber(r[x]),yv=safeNumber(r[y]);if(xv===null||yv===null)return'';const px=18+(xv-xmin)/(xmax-xmin||1)*304,py=150-(yv-ymin)/(ymax-ymin||1)*125;return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${selected.has(r.id)?4:2.2}" class="${selected.has(r.id)?'mini-selected':''}"/>`;}).join('');
  return `<svg class="mini-chart" viewBox="0 0 340 170"><line x1="18" y1="150" x2="326" y2="150"/><line x1="18" y1="15" x2="18" y2="150"/>${pts}<text x="170" y="166" text-anchor="middle">${esc(label(x))}</text><text x="6" y="14">${esc(label(y))}</text></svg>`;
}

function miniTimeline(s, records) {
  const tf=s.dimensions.time,yf=s.dimensions.y;if(!tf)return '<div class="canvas-empty">No time field</div>';
  const rows=records.filter(r=>!Number.isNaN(Date.parse(r[tf]))&&safeNumber(r[yf])!==null).sort((a,b)=>Date.parse(a[tf])-Date.parse(b[tf]));if(!rows.length)return '<div class="canvas-empty">No timeline data</div>';
  const [mn,mx]=extent(rows,yf),t0=Date.parse(rows[0][tf]),t1=Date.parse(rows.at(-1)[tf]);const step=Math.max(1,Math.floor(rows.length/90));const sample=rows.filter((_,i)=>i%step===0||i===rows.length-1);
  const d=sample.map((r,i)=>`${i?'L':'M'}${(18+(Date.parse(r[tf])-t0)/(t1-t0||1)*304).toFixed(1)},${(150-(Number(r[yf])-mn)/(mx-mn||1)*125).toFixed(1)}`).join(' ');
  return `<svg class="mini-chart" viewBox="0 0 340 170"><path d="${d}"/><text x="170" y="166" text-anchor="middle">${esc(label(yf))} over time</text></svg>`;
}

function miniTable(s, records) {
  const cols=['id',...s.dataset.keyFields.slice(0,2),...s.dataset.numericFields.slice(0,2)];
  return `<div class="mini-table"><table><thead><tr>${cols.map(c=>`<th>${esc(label(c))}</th>`).join('')}</tr></thead><tbody>${records.slice(0,8).map(r=>`<tr class="${s.selection.includes(r.id)?'selected-row':''}">${cols.map(c=>`<td>${esc(formatNumber(r[c]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function miniGraph(s) {
  return `<div class="mini-graph">${s.dataset.graph.edges.slice(0,9).map(edge=>{const a=s.dataset.graph.nodes.find(n=>n.id===edge.source)?.label||edge.source,b=s.dataset.graph.nodes.find(n=>n.id===edge.target)?.label||edge.target;return `<div><strong>${esc(a)}</strong><span> ${esc(edge.label)} → </span><strong>${esc(b)}</strong></div>`;}).join('')}</div>`;
}

export function renderEvidenceMedia(doc) {
  if (!doc?.mediaType) return '';
  const media=doc.media||{};
  if(doc.mediaType==='image') return `<div class="evidence-media image-evidence"><div class="image-placeholder"><div class="image-grid"></div>${(media.boxes||[]).map(b=>`<div class="image-box" style="left:${b.x*100}%;top:${b.y*100}%;width:${b.w*100}%;height:${b.h*100}%"><span>${esc(b.label)}</span></div>`).join('')}<div class="image-caption">${esc(media.caption||doc.title)}</div></div></div>`;
  if(doc.mediaType==='map') {
    const pts=media.points||[];
    if(!pts.length) return '<div class="canvas-empty">No map points</div>';
    const lats=pts.map(p=>Number(p.lat)),lons=pts.map(p=>Number(p.lon));
    const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
    const latSpan=(maxLat-minLat)||1,lonSpan=(maxLon-minLon)||1;
    return `<div class="evidence-media map-evidence"><div class="map-grid">${pts.map(p=>{const px=10+(Number(p.lon)-minLon)/lonSpan*80,py=85-(Number(p.lat)-minLat)/latSpan*70;const edge=px>70?' edge-right':'';return `<div class="map-pin${edge}" style="left:${px}%;top:${py}%"><i></i><span>${esc(p.label)} · ${esc(p.value)}</span></div>`;}).join('')}</div></div>`;
  }
  if(doc.mediaType==='log') return `<div class="evidence-media log-evidence">${(media.lines||[]).map((line,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><code>${esc(line)}</code></div>`).join('')}</div>`;
  return '';
}

function reasoningBody(s) {
  const graph=buildReasoningGraph(s.hypotheses,s.dataset.documents,s.findings||[],s.causalLinks||[]);
  return `<div class="reasoning-mini"><div class="reasoning-stats"><span>${graph.nodes.length} nodes</span><span>${graph.edges.length} links</span></div>${(s.findings||[]).slice(0,4).map(f=>`<div class="finding-mini"><strong>${esc(f.title)}</strong><span>${Math.round(f.confidence||0)}%</span><p>${esc(f.text)}</p></div>`).join('')}${(s.causalLinks||[]).slice(0,6).map(l=>`<div class="causal-mini"><code>${esc(l.source)}</code><span> ${esc(l.label)} → </span><code>${esc(l.target)}</code></div>`).join('')}</div>`;
}

function viewBody(view,s,store) {
  const records=store.getVisibleRecords();
  if(view.type==='scatter')return miniScatter(s,records);
  if(view.type==='timeline')return miniTimeline(s,records);
  if(view.type==='table')return miniTable(s,records);
  if(view.type==='graph')return miniGraph(s);
  if(view.type==='hypotheses')return `<div class="canvas-list">${s.hypotheses.map(h=>`<div><strong>${esc(h.title)}</strong><span>${Math.round(h.confidence)}% · ${esc(h.status)}</span>${h.parentId?`<small>fork of ${esc(h.parentId)}</small>`:''}</div>`).join('')}</div>`;
  if(view.type==='reasoning')return reasoningBody(s);
  if(view.type==='selection'){const ids=new Set(s.selection),a=s.dataset.records.filter(r=>ids.has(r.id)),b=records.filter(r=>!ids.has(r.id));const features=a.length&&b.length?rankDiscriminatingFeatures(a,b,s.dataset.numericFields,s.dataset.keyFields).slice(0,6):[];return `<div class="canvas-list">${features.length?features.map(f=>`<div><strong>${esc(label(f.field))}</strong><span>score ${Number(f.score||0).toFixed(2)}</span></div>`).join(''):'<div class="canvas-empty">Select records to compare</div>'}</div>`;}
  if(view.type==='evidence')return `<div class="canvas-list">${s.dataset.documents.slice(0,8).map(d=>`<div><strong>${esc(d.title)}</strong><span>${esc(d.type)}${d.mediaType?` · ${esc(d.mediaType)}`:''}</span></div>`).join('')}</div>`;
  if(view.type==='rich-evidence'||['image','map','log'].includes(view.type)){const desired=view.type==='rich-evidence'?null:view.type;const doc=(view.evidenceId&&s.dataset.documents.find(d=>d.id===view.evidenceId))||s.dataset.documents.find(d=>d.mediaType&&(desired?d.mediaType===desired:true));return doc?`<div class="canvas-media-title">${esc(doc.title)}</div>${renderEvidenceMedia(doc)}`:'<div class="canvas-empty">No matching rich evidence</div>';}
  return `<div class="summary-view">${esc(view.content||'Agent-created analysis summary. Use WebMCP to populate this view with a concise finding or next step.')}</div>`;
}

function linkSvg(s){const views=new Map((s.canvas?.views||[]).map(v=>[v.id,v]));return `<svg class="canvas-links" width="1800" height="1120">${(s.canvas?.links||[]).map(l=>{const a=views.get(l.source),b=views.get(l.target);if(!a||!b)return'';const x1=a.x+a.w/2,y1=a.y+a.h/2,x2=b.x+b.w/2,y2=b.y+b.h/2;return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-5}" text-anchor="middle">${esc(l.label)}</text></g>`;}).join('')}</svg>`;}

export function renderSpatialCanvas(s,store) {
  const c=s.canvas||{views:[],links:[],zoom:1,panX:0,panY:0};
  return `<div class="spatial-shell"><div class="canvas-toolbar"><div><strong>Investigation Canvas</strong><span>Human and agent manipulate the same persistent views</span></div><div class="canvas-tools"><button class="btn ghost" data-canvas-zoom="out">−</button><span>${Math.round((c.zoom||1)*100)}%</span><button class="btn ghost" data-canvas-zoom="in">+</button><button class="btn" data-canvas-arrange="grid">Auto layout</button><button class="btn" data-canvas-arrange="focus">Focus layout</button><button class="btn primary" id="canvas-add-view">Add view</button></div></div><div class="canvas-viewport"><div class="canvas-stage" style="transform:translate(${Number(c.panX||0)}px,${Number(c.panY||0)}px) scale(${Number(c.zoom||1)})">${linkSvg(s)}${(c.views||[]).map(view=>`<article class="canvas-view ${c.focusedViewId===view.id?'focused':''}" data-canvas-view="${esc(view.id)}" style="left:${view.x}px;top:${view.y}px;width:${view.w}px;height:${view.h}px"><header class="canvas-view-head"><div><strong>${esc(view.title)}</strong><span>${esc(view.type)}${view.agentCreated?' · AGENT CREATED':''}</span></div><div class="canvas-view-actions"><button data-canvas-focus="${esc(view.id)}" title="Focus">◎</button>${view.agentCreated?`<button data-canvas-remove="${esc(view.id)}" title="Remove">×</button>`:''}</div></header><div class="canvas-view-body">${viewBody(view,s,store)}</div><i class="canvas-resize" data-canvas-resize="${esc(view.id)}"></i></article>`).join('')}</div></div></div>`;
}

export function bindSpatialCanvasEvents(store) {
  const viewport=document.querySelector('.canvas-viewport');if(!viewport)return;
  document.querySelectorAll('[data-canvas-focus]').forEach(b=>b.addEventListener('click',ev=>{ev.stopPropagation();store.focusCanvasView(b.dataset.canvasFocus);}));
  document.querySelectorAll('[data-canvas-remove]').forEach(b=>b.addEventListener('click',ev=>{ev.stopPropagation();store.removeCanvasView(b.dataset.canvasRemove);}));
  document.querySelectorAll('[data-canvas-arrange]').forEach(b=>b.addEventListener('click',()=>store.arrangeCanvas(b.dataset.canvasArrange)));
  document.querySelectorAll('[data-canvas-zoom]').forEach(b=>b.addEventListener('click',()=>{const z=store.state.canvas.zoom+(b.dataset.canvasZoom==='in'?0.1:-0.1);store.setCanvasViewport({zoom:z});}));
  document.querySelector('#canvas-add-view')?.addEventListener('click',()=>{const type=prompt('View type: summary, selection, image, map, log, evidence, reasoning','summary');if(type)store.addCanvasView({type,title:`${label(type)} view`,content:type==='summary'?'New human-created analysis note':''});});

  // Mobile is a stacked reading surface; do not mutate hidden desktop geometry from touch drags.
  if (window.matchMedia('(max-width: 760px)').matches) return;

  document.querySelectorAll('.canvas-view-head').forEach(head=>head.addEventListener('pointerdown',ev=>{if(ev.target.closest('button'))return;const card=head.closest('.canvas-view'),id=card.dataset.canvasView,view=store.state.canvas.views.find(v=>v.id===id);if(!view)return;const sx=ev.clientX,sy=ev.clientY,ox=view.x,oy=view.y;let nx=ox,ny=oy;const move=e=>{nx=ox+(e.clientX-sx)/(store.state.canvas.zoom||1);ny=oy+(e.clientY-sy)/(store.state.canvas.zoom||1);card.style.left=`${nx}px`;card.style.top=`${ny}px`;};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);store.updateCanvasView(id,{x:nx,y:ny},'human');};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});}));
  document.querySelectorAll('[data-canvas-resize]').forEach(handle=>handle.addEventListener('pointerdown',ev=>{ev.stopPropagation();const card=handle.closest('.canvas-view'),id=handle.dataset.canvasResize,view=store.state.canvas.views.find(v=>v.id===id);if(!view)return;const sx=ev.clientX,sy=ev.clientY,ow=view.w,oh=view.h;let nw=ow,nh=oh;const move=e=>{nw=Math.max(240,ow+(e.clientX-sx)/(store.state.canvas.zoom||1));nh=Math.max(160,oh+(e.clientY-sy)/(store.state.canvas.zoom||1));card.style.width=`${nw}px`;card.style.height=`${nh}px`;};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);store.updateCanvasView(id,{w:nw,h:nh},'human');};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});}));

  viewport.addEventListener('pointerdown',ev=>{if(ev.target!==viewport)return;const sx=ev.clientX,sy=ev.clientY,ox=store.state.canvas.panX||0,oy=store.state.canvas.panY||0,stage=viewport.querySelector('.canvas-stage');let px=ox,py=oy;const move=e=>{px=ox+e.clientX-sx;py=oy+e.clientY-sy;stage.style.transform=`translate(${px}px,${py}px) scale(${store.state.canvas.zoom||1})`;};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);store.setCanvasViewport({panX:px,panY:py});};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});});
}
