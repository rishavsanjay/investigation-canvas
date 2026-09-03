from playwright.sync_api import sync_playwright

URL='http://127.0.0.1:4173/'
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--allow-file-access-from-files'])
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
    page.goto(URL, wait_until='networkidle')
    assert page.locator('.brand-title').inner_text() == 'Investigation Canvas'
    tools=page.evaluate('window.__registeredTools.length')
    assert tools >= 20, tools
    assert page.locator('.point[data-record-id]').count() > 100

    # Human-linked selection
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

    # Tabs render without runtime errors
    for tab in ['hypotheses','evidence','provenance','explore']:
      page.locator(f'[data-tab="{tab}"]').click()
      page.wait_for_timeout(80)

    # Dataset switch and chart rerender
    page.locator('#dataset-switcher').select_option('model-regression')
    page.wait_for_timeout(100)
    assert 'Model quality regression' in page.locator('.dataset-title').inner_text()
    assert page.locator('.point[data-record-id]').count() > 100
    page.locator('#dataset-switcher').select_option('fraud-ring')
    page.wait_for_timeout(100)
    assert 'Suspicious transaction network' in page.locator('.dataset-title').inner_text()

    page.screenshot(path='/mnt/data/investigation-canvas/assets/e2e-desktop.png', full_page=True)

    # Responsive smoke test
    mobile=browser.new_page(viewport={'width':390,'height':844})
    mobile.on('pageerror', lambda exc: errors.append(f'mobile pageerror: {exc}'))
    mobile.goto(URL, wait_until='networkidle')
    assert mobile.locator('.brand-title').count()==1
    assert mobile.locator('.card').count()>=4
    mobile.screenshot(path='/mnt/data/investigation-canvas/assets/e2e-mobile.png', full_page=True)
    mobile.close()
    browser.close()

if errors:
    raise AssertionError('\n'.join(errors))
print(f'E2E passed; registered tools={tools}')
