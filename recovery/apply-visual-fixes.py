from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"replacement target missing: {label}")
    return text.replace(old, new, 1)


app = Path("investigation-canvas/src/app.js")
text = app.read_text()
text = replace_once(
    text,
    "  const W=760,H=300, L=48,R=16,T=14,B=34;\n  const sx=v=>L+(Number(v)-xmin)/(xmax-xmin)*(W-L-R);\n  const sy=v=>T+(1-(Number(v)-ymin)/(ymax-ymin))*(H-T-B);",
    "  const W=760,H=300, L=48,R=16,T=14,B=34;\n  const xSpan=(xmax-xmin)||1, ySpan=(ymax-ymin)||1;\n  const sx=v=>L+(Number(v)-xmin)/xSpan*(W-L-R);\n  const sy=v=>T+(1-(Number(v)-ymin)/ySpan)*(H-T-B);",
    "scatter zero-span handling",
)
text = replace_once(
    text,
    'return `<div class="card"><div class="card-head"><div><div class="card-title">Linked scatter',
    'return `<div class="card chart-card"><div class="card-head"><div><div class="card-title">Linked scatter',
    "scatter responsive card class",
)
text = replace_once(
    text,
    "  const [ymin,ymax]=extent(timed,yField); const sx=v=>L+(Date.parse(v)-tmin)/(tmax-tmin||1)*(W-L-R); const sy=v=>T+(1-(Number(v)-ymin)/(ymax-ymin))*(H-T-B);",
    "  const [ymin,ymax]=extent(timed,yField); const ySpan=(ymax-ymin)||1; const sx=v=>L+(Date.parse(v)-tmin)/(tmax-tmin||1)*(W-L-R); const sy=v=>T+(1-(Number(v)-ymin)/ySpan)*(H-T-B);",
    "timeline zero-span handling",
)
text = replace_once(
    text,
    '<div class="card-body"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">',
    '<div class="card-body"><div class="signals-grid">',
    "responsive investigation signals",
)
text = replace_once(
    text,
    'return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div><div style="font-size:15px;font-weight:760">Competing hypotheses',
    'return `<div class="page-heading hypothesis-heading"><div><div style="font-size:15px;font-weight:760">Competing hypotheses',
    "responsive hypothesis heading",
)
text = replace_once(
    text,
    'return `<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px"><div><div style="font-size:15px;font-weight:760">Evidence library',
    'return `<div class="page-heading evidence-heading"><div><div style="font-size:15px;font-weight:760">Evidence library',
    "responsive evidence heading",
)
text = replace_once(
    text,
    '<input class="search" id="evidence-search" style="width:260px" placeholder="Search documents" />',
    '<input class="search evidence-search" id="evidence-search" placeholder="Search documents" />',
    "responsive evidence search",
)
app.write_text(text)

workspace = Path("investigation-canvas/src/workspace.js")
text = workspace.read_text()
old_map = "  if(doc.mediaType==='map') { const pts=media.points||[]; const lats=pts.map(p=>p.lat),lons=pts.map(p=>p.lon),minLat=Math.min(...lats,0),maxLat=Math.max(...lats,1),minLon=Math.min(...lons,0),maxLon=Math.max(...lons,1);return `<div class=\"evidence-media map-evidence\"><div class=\"map-grid\">${pts.map(p=>`<div class=\"map-pin\" style=\"left:${10+(p.lon-minLon)/(maxLon-minLon||1)*80}%;top:${85-(p.lat-minLat)/(maxLat-minLat||1)*70}%\"><i></i><span>${esc(p.label)} · ${esc(p.value)}</span></div>`).join('')}</div></div>`; }"
new_map = """  if(doc.mediaType==='map') {
    const pts=media.points||[];
    if(!pts.length) return '<div class=\"canvas-empty\">No map points</div>';
    const lats=pts.map(p=>Number(p.lat)),lons=pts.map(p=>Number(p.lon));
    const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
    const latSpan=(maxLat-minLat)||1,lonSpan=(maxLon-minLon)||1;
    return `<div class=\"evidence-media map-evidence\"><div class=\"map-grid\">${pts.map(p=>{const px=10+(Number(p.lon)-minLon)/lonSpan*80,py=85-(Number(p.lat)-minLat)/latSpan*70;const edge=px>70?' edge-right':'';return `<div class=\"map-pin${edge}\" style=\"left:${px}%;top:${py}%\"><i></i><span>${esc(p.label)} · ${esc(p.value)}</span></div>`;}).join('')}</div></div>`;
  }"""
text = replace_once(text, old_map, new_map, "map geographic normalization")
add_view = "  document.querySelector('#canvas-add-view')?.addEventListener('click',()=>{const type=prompt('View type: summary, selection, image, map, log, evidence, reasoning','summary');if(type)store.addCanvasView({type,title:`${label(type)} view`,content:type==='summary'?'New human-created analysis note':''});});"
guarded = add_view + "\n\n  // Mobile is a stacked reading surface; do not mutate hidden desktop geometry from touch drags.\n  if (window.matchMedia('(max-width: 760px)').matches) return;"
text = replace_once(text, add_view, guarded, "disable hidden mobile drag geometry")
workspace.write_text(text)

css = Path("investigation-canvas/styles.css")
text = css.read_text().replace("var(--border)", "var(--line)")
marker = "/* VISUAL_AUDIT_FIXES_V1 */"
if marker not in text:
    text += r'''

/* VISUAL_AUDIT_FIXES_V1 */
.signals-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.page-heading { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; margin-bottom:10px; }
.page-heading > div:first-child { min-width:0; }
.evidence-search { width:260px; flex:0 1 260px; }
.map-pin.edge-right span { left:auto; right:10px; }

@media (max-width:760px) {
  .canvas-tools [data-canvas-zoom],
  .canvas-tools [data-canvas-arrange],
  .canvas-tools > span { display:none; }
}

@media (max-width:470px) {
  .signals-grid { grid-template-columns:1fr; gap:10px; }
  .chart-card .card-head { align-items:stretch; flex-direction:column; }
  .chart-card .card-actions { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); width:100%; }
  .chart-card .field-select { min-width:0; width:100%; }
  .page-heading { align-items:stretch; flex-direction:column; }
  .evidence-search { width:100%; flex-basis:auto; }
  .evidence-columns { grid-template-columns:1fr; }
  .form-grid.two { grid-template-columns:1fr; }
  .toast-stack { left:10px; right:10px; bottom:10px; }
  .toast { min-width:0; max-width:none; width:100%; }
}
'''
css.write_text(text)

verifier = Path("recovery/webmcp-kit-browser-verify.py")
if verifier.exists():
    v = verifier.read_text()
    v = v.replace(".split(/\\s+/)[0]", ".split(/\\\\s+/)[0]")
    verifier.write_text(v)
