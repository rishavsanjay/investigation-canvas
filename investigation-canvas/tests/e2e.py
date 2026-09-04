import os
from pathlib import Path

from playwright.sync_api import sync_playwright

URL=os.environ.get('E2E_URL','http://127.0.0.1:4173/')
CHROMIUM_PATH=os.environ.get('CHROMIUM_PATH')
ARTIFACTS_DIR=Path(os.environ.get('ARTIFACTS_DIR',Path(__file__).resolve().parents[1]/'assets'))
ARTIFACTS_DIR.mkdir(parents=True,exist_ok=True)
errors=[]

LAYOUT_AUDIT = r'''() => {
  const vw = innerWidth;
  const visible = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const hasScrollableAncestor = el => {
    for (let p=el.parentElement; p; p=p.parentElement) {
      const s=getComputedStyle(p);
      if (['auto','scroll'].includes(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const issues=[];
  if (document.documentElement.scrollWidth > vw + 1) {
    issues.push(`page horizontal overflow: ${document.documentElement.scrollWidth} > ${vw}`);
  }
  document.querySelectorAll('button,input,select,textarea').forEach(el => {
    if (!visible(el) || el.closest('.canvas-viewport')) return;
    const r=el.getBoundingClientRect();
    if ((r.left < -1 || r.right > vw + 1) && !hasScrollableAncestor(el)) {
      issues.push(`interactive offscreen: ${el.tagName}#${el.id || ''}.${el.className || ''}`);
    }
  });
  document.querySelectorAll('circle.point').forEach(el => {
    for (const attr of ['cx','cy']) {
      if (!Number.isFinite(Number(el.getAttribute(attr)))) issues.push(`nonfinite ${attr}`);
    }
  });
  const toolbar=document.querySelector('.canvas-toolbar');
  if (toolbar && visible(toolbar) && getComputedStyle(toolbar).borderTopWidth === '0px') {
    issues.push('missing canvas toolbar border');
  }
  const viewHead=document.querySelector('.canvas-view-head');
  if (viewHead && visible(viewHead) && getComputedStyle(viewHead).borderBottomWidth === '0px') {
    issues.push('missing canvas view header border');
  }
  const signals=[...document.querySelectorAll('.card-title')]
    .find(e => e.textContent === 'Investigation signals')?.closest('.card')?.querySelector('.signals-grid');
  if (vw <= 470 && signals && visible(signals)) {
    const cols=getComputedStyle(signals).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
    if (cols.length > 1) issues.push(`mobile signals has ${cols.length} columns`);
  }
  document.querySelectorAll('.map-pin span').forEach(el => {
    if (!visible(el)) return;
    const r=el.getBoundingClientRect(), c=el.closest('.map-grid')?.getBoundingClientRect();
    if (c && (r.left < c.left-1 || r.right > c.right+1 || r.top < c.top-1 || r.bottom > c.bottom+1)) {
      issues.push(`map label clipped: ${el.innerText}`);
    }
  });
  return issues;
}'''


def assert_layout(page, label):
    issues=page.evaluate(LAYOUT_AUDIT)
    assert not issues, f"{label} layout defects: {issues}"


with sync_playwright() as p:
    launch_options={'headless':True,'args':['--no-sandbox','--allow-file-access-from-files']}
    if CHROMIUM_PATH:
        launch_options['executable_path']=CHROMIUM_PATH
    elif Path('/usr/bin/chromium').exists():
        launch_options['executable_path']='/usr/bin/chromium'
    browser=p.chromium.launch(**launch_options)
    page=browser.new_page(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    page.add_init_script("""
      window.__registeredTools = [];
      Object.defineProperty(document, 'modelContext', { configurable: true, value: {
        registerTool: async (tool) => { window.__registeredTools.push(tool); },
        getTools: async () => window.__registeredTools
      }});
    """)
    page.on('console', lambda msg: errors.append(f'console {msg.type}: {msg.text}') if msg.type=='error' else None)
    page.on('pageerror', lambda exc: errors.append(f'pageerror: {exc}'))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(URL, wait_until='networkidle')
    assert page.locator('.brand-title').inner_text() == 'Investigation Canvas'
    tools=page.evaluate('window.__registeredTools.length')
    assert tools == 48, tools
    assert page.locator('.point[data-record-id]').count() > 100
    assert_layout(page, 'desktop explore')

    # A real plotted-point click must not move or resize the chart viewport.
    before_point_click = page.evaluate("""() => ({
      content:document.querySelector('.content').getBoundingClientRect().toJSON(),
      scatter:document.querySelector('#scatter-svg').getBoundingClientRect().toJSON()
    })""")
    point_box = page.locator('#scatter-svg .point[data-record-id]').first.bounding_box()
    assert point_box
    page.mouse.click(point_box['x'] + point_box['width'] / 2, point_box['y'] + point_box['height'] / 2)
    after_point_click = page.evaluate("""() => ({
      content:document.querySelector('.content').getBoundingClientRect().toJSON(),
      scatter:document.querySelector('#scatter-svg').getBoundingClientRect().toJSON()
    })""")
    for region in ['content', 'scatter']:
        for field in ['x', 'y', 'width', 'height']:
            assert abs(after_point_click[region][field]-before_point_click[region][field]) < 1, (region, field, before_point_click, after_point_click)

    # Rerendering after another point selection must also preserve manual scroll.
    point_click_view = page.evaluate("""() => {
      const content=document.querySelector('.content');
      content.scrollTop=Math.min(240,content.scrollHeight-content.clientHeight);
      const before={top:content.scrollTop,x:window.InvestigationCanvas.store.state.xDim,y:window.InvestigationCanvas.store.state.yDim};
      document.querySelector('.point[data-record-id]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
      const next=document.querySelector('.content');
      return {before,after:{top:next.scrollTop,x:window.InvestigationCanvas.store.state.xDim,y:window.InvestigationCanvas.store.state.yDim}};
    }""")
    assert point_click_view['before']['top'] > 0
    assert abs(point_click_view['after']['top']-point_click_view['before']['top']) < 2
    assert point_click_view['after']['x'] == point_click_view['before']['x']
    assert point_click_view['after']['y'] == point_click_view['before']['y']

    # Concurrent agent updates must not destroy a human's in-progress modal draft.
    page.locator('[data-tab="hypotheses"]').click()
    page.locator('#add-hypothesis').click()
    page.locator('#hyp-title').fill('Human draft in progress')
    page.evaluate("window.InvestigationCanvas.store.setSelection([window.InvestigationCanvas.store.state.dataset.records[0].id], 'agent')")
    assert page.locator('#hyp-title').input_value() == 'Human draft in progress'
    page.keyboard.press('Escape')

    # Full rerenders preserve keyboard focus and cursor position.
    page.locator('#global-search').focus()
    page.locator('#global-search').fill('Safari')
    page.keyboard.press('Enter')
    assert page.evaluate("document.activeElement?.id") == 'global-search'
    page.locator('#global-search').fill('')
    page.keyboard.press('Enter')

    # Human-linked selection
    page.locator('[data-tab="explore"]').click()
    first=page.locator('[data-row-id]').first
    first.click()
    assert page.locator('.selection-banner').count()==1

    # Human filtering
    page.locator('#quick-filter-field').select_option('platform')
    page.locator('#quick-filter-value').fill('mobile')
    page.locator('#quick-filter-add').click()
    assert page.locator('.filter-chip').count() >= 1
    page.locator('#clear-filters').click()

    # Agent mutations through the exact registered WebMCP tool callbacks
    result=page.evaluate("""async () => {
      const tools = Object.fromEntries(window.__registeredTools.map(t => [t.name, t]));
      const id = window.InvestigationCanvas.store.state.dataset.records[400].id;
      await tools.set_selection.execute({recordIds:[id]});
      const h = await tools.create_hypothesis.execute({title:'E2E agent hypothesis', confidence:64, questions:['Can this be falsified?']});
      await tools.add_filter.execute({field:'browser',op:'eq',value:'Safari 20.2'});
      const evidence = await tools.search_evidence.execute({query:'Safari'});
      return {selected: window.InvestigationCanvas.store.state.selection.length, hyp:h.title, docs:evidence.documents.length};
    }""")
    assert result['selected']==1
    assert result['hyp']=='E2E agent hypothesis'
    assert result['docs']>=1

    # Major views render cleanly and Canvas keeps its visual structure.
    for tab in ['hypotheses','evidence','provenance','explore','canvas']:
      page.locator(f'[data-tab="{tab}"]').click()
      page.wait_for_timeout(80)
      assert_layout(page, f'desktop {tab}')

    # Evidence search remains active while documents are opened.
    page.locator('[data-tab="evidence"]').click()
    page.locator('#evidence-search').fill('release')
    visible_before=page.locator('[data-doc-id]:not(.hidden)').count()
    if visible_before:
        page.locator('[data-doc-id]:not(.hidden)').first.click()
        assert page.locator('#evidence-search').input_value() == 'release'
        assert page.locator('[data-doc-id]:not(.hidden)').count() == visible_before

    # Dragging the stage background updates the canvas viewport.
    page.locator('[data-tab="canvas"]').click()
    page.evaluate("""() => {
      const stage=document.querySelector('.canvas-stage');
      stage.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:400,clientY:700,pointerId:1}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:460,clientY:740,pointerId:1}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:460,clientY:740,pointerId:1}));
    }""")
    assert page.evaluate('window.InvestigationCanvas.store.state.canvas.panX') == 60
    cancel_result=page.evaluate("""() => {
      const stage=document.querySelector('.canvas-stage');
      const before=stage.style.transform;
      stage.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:400,clientY:700,pointerId:2}));
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:520,clientY:760,pointerId:2}));
      window.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,clientX:520,clientY:760,pointerId:2}));
      return {before,after:stage.style.transform,panX:window.InvestigationCanvas.store.state.canvas.panX};
    }""")
    assert cancel_result['after']==cancel_result['before'] and cancel_result['panX']==60

    # Dataset switch and chart rerender
    page.locator('[data-tab="explore"]').click()
    page.locator('#dataset-switcher').select_option('model-regression')
    page.wait_for_timeout(100)
    assert 'Model quality regression' in page.locator('.dataset-title').inner_text()
    assert page.locator('.point[data-record-id]').count() > 100
    assert_layout(page, 'desktop model regression')
    page.locator('#dataset-switcher').select_option('fraud-ring')
    page.wait_for_timeout(100)
    assert 'Suspicious transaction network' in page.locator('.dataset-title').inner_text()
    assert_layout(page, 'desktop fraud ring')

    page.screenshot(path=str(ARTIFACTS_DIR/'e2e-desktop.png'), full_page=True)

    # Responsive regression test: exact defects previously found by the visual audit.
    mobile=browser.new_page(viewport={'width':390,'height':844})
    mobile.on('console', lambda msg: errors.append(f'mobile console {msg.type}: {msg.text}') if msg.type=='error' else None)
    mobile.on('pageerror', lambda exc: errors.append(f'mobile pageerror: {exc}'))
    mobile.goto(URL, wait_until='networkidle')
    assert mobile.locator('.brand-title').count()==1
    assert mobile.locator('.card').count()>=4
    assert_layout(mobile, 'mobile explore')

    mobile.locator('[data-tab="canvas"]').click()
    mobile.wait_for_timeout(80)
    assert mobile.locator('.canvas-view').count() >= 1
    assert_layout(mobile, 'mobile canvas')

    mobile.locator('[data-tab="evidence"]').click()
    mobile.wait_for_timeout(80)
    map_doc=mobile.locator('[data-doc-id="media-checkout-map"]')
    if map_doc.count():
        map_doc.click()
        mobile.wait_for_timeout(80)
        assert_layout(mobile, 'mobile evidence map')

    mobile.screenshot(path=str(ARTIFACTS_DIR/'e2e-mobile.png'), full_page=True)
    mobile.close()

    # Tablet/small-laptop header actions must not intercept the Provenance tab.
    tablet=browser.new_page(viewport={'width':1024,'height':768})
    tablet.goto(URL,wait_until='networkidle')
    tablet.locator('[data-tab="provenance"]').click()
    assert tablet.locator('[data-tab="provenance"]').get_attribute('class').find('active') >= 0
    tablet.close()

    # Imported coordinate strings are normalized and cannot create executable DOM.
    security=browser.new_page(viewport={'width':900,'height':700})
    security.goto(URL,wait_until='networkidle')
    result=security.evaluate("""() => {
      window.__auditXss=0;
      const payload=window.InvestigationCanvas.store.exportState();
      payload.workspace.activeTab='canvas';
      payload.workspace.canvas.views[0].x='0\"/><image id="audit-xss" href="x" onerror="window.__auditXss=1"/><line x1="0';
      window.InvestigationCanvas.store.importState(payload);
      return {x:window.InvestigationCanvas.store.state.canvas.views[0].x,injected:document.querySelectorAll('#audit-xss').length,executed:window.__auditXss};
    }""")
    assert isinstance(result['x'],(int,float))
    assert result['injected']==0 and result['executed']==0
    security.close()
    browser.close()

if errors:
    raise AssertionError('\n'.join(errors))
print(f'E2E passed; registered tools={tools}; visual layout regression checks passed')
