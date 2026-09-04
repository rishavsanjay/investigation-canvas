import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get('E2E_URL', 'http://127.0.0.1:4173/').split('?')[0]
CHROMIUM_PATH = os.environ.get('CHROMIUM_PATH')
ARTIFACTS_DIR = Path(os.environ.get('ARTIFACTS_DIR', Path(__file__).resolve().parents[1] / 'assets'))
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


with sync_playwright() as p:
    launch_options = {'headless': True, 'args': ['--no-sandbox']}
    if CHROMIUM_PATH:
        launch_options['executable_path'] = CHROMIUM_PATH
    elif Path('/usr/bin/chromium').exists():
        launch_options['executable_path'] = '/usr/bin/chromium'

    browser = p.chromium.launch(**launch_options)

    onboarding_context = browser.new_context(viewport={'width': 1280, 'height': 720})
    onboarding_page = onboarding_context.new_page()
    onboarding_page.goto(f'{BASE_URL}?demo=1', wait_until='networkidle')
    onboarding_page.locator('#demo-pause-btn').click()
    onboarding = onboarding_page.evaluate(r"""() => {
      const panel = document.querySelector('#demo-overlay').getBoundingClientRect();
      const workspace = document.querySelector('.workspace').getBoundingClientRect();
      const messages = document.querySelector('#demo-messages');
      return {
        outcomes: document.querySelectorAll('.demo-outcome-card').length,
        toolPills: document.querySelectorAll('.demo-tool-pill').length,
        scrollTop: messages.scrollTop,
        scrollFits: messages.scrollHeight <= messages.clientHeight,
        panelWidth: panel.width,
        workspaceWidth: workspace.width,
        viewportWidth: innerWidth,
        rightbarDisplay: getComputedStyle(document.querySelector('.rightbar')).display
      };
    }""")
    assert onboarding['outcomes'] == 5 and onboarding['toolPills'] == 0
    assert onboarding['scrollTop'] == 0 and onboarding['scrollFits']
    assert 360 <= onboarding['panelWidth'] <= 380
    assert abs(onboarding['workspaceWidth'] + onboarding['panelWidth'] - onboarding['viewportWidth']) < 2
    assert onboarding['rightbarDisplay'] == 'none'
    onboarding_context.close()

    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    normal_before = context.new_page()
    normal_before.goto(BASE_URL, wait_until='networkidle')
    normal_before.locator('#dataset-switcher').select_option('model-regression')
    assert normal_before.locator('#dataset-switcher').input_value() == 'model-regression'
    normal_before.close()

    page = context.new_page()
    errors = []
    page.add_init_script("""
      window.__registeredTools = [];
      Object.defineProperty(document, 'modelContext', { configurable: true, value: {
        registerTool: async (tool) => { window.__registeredTools.push(tool); },
        getTools: async () => window.__registeredTools
      }});
    """)
    page.on('console', lambda msg: errors.append(f'console {msg.type}: {msg.text}') if msg.type == 'error' else None)
    page.on('pageerror', lambda exc: errors.append(f'pageerror: {exc}'))

    page.goto(f'{BASE_URL}?demo=1&demoSpeed=20', wait_until='networkidle')
    page.locator('.demo-tool-call code').wait_for(timeout=10_000)
    assert page.locator('.demo-tool-call code').inner_text() in {
        'describe_workspace', 'select_where', 'compare_selection_to_rest',
        'search_evidence', 'update_hypothesis', 'attach_evidence_to_hypothesis',
        'focus_evidence', 'create_finding', 'create_canvas_view', 'focus_canvas_view',
        'get_selection', 'fork_hypothesis', 'add_causal_link', 'get_activity_provenance'
    }
    page.locator('.demo-actor.complete').wait_for(timeout=30_000)
    assert page.locator('#demo-cursor.visible').count() == 1
    assert page.locator('.demo-tag').count() == 0
    assert page.locator('.demo-agent-name').inner_text() == 'WebMCP Agent'
    result = page.evaluate(r"""() => {
      const s=window.InvestigationCanvas.store.state;
      return {
        dataset:s.dataset.id,
        tab:s.activeTab,
        tools:window.__registeredTools.length,
        client:s.hypotheses.find(h => h.id === 'hyp-client'),
        payment:s.hypotheses.find(h => h.id === 'hyp-payment'),
        pricing:s.hypotheses.find(h => /pricing experiment B/i.test(h.title)),
        findings:s.findings.length,
        agentActions:s.activity.filter(a => a.source === 'agent').length,
        humanActions:s.activity.filter(a => a.source === 'human').length,
        canvasArtifact:s.canvas.views.some(v => v.agentCreated && /Safari 20\.2/i.test(v.title))
      };
    }""")
    assert result['dataset'] == 'checkout-regression'
    assert result['tab'] == 'provenance'
    assert result['tools'] == 48
    assert result['client']['status'] == 'supported'
    assert result['payment']['status'] == 'weakened'
    assert 'doc-experiment-b' in result['pricing']['supporting']
    assert result['findings'] >= 2
    assert result['agentActions'] > 0 and result['humanActions'] > 0
    assert result['canvasArtifact']
    conversation = page.evaluate(r"""() => ({
      narratives: document.querySelectorAll('#demo-messages .demo-narrative-msg').length,
      transcriptTools: document.querySelectorAll('#demo-messages .demo-step-card').length,
      completedActions: document.querySelectorAll('.demo-action-item').length,
      staleLiveActivity: document.querySelectorAll('.demo-live-activity').length
    })""")
    assert conversation == {
        'narratives': 4,
        'transcriptTools': 0,
        'completedActions': 22,
        'staleLiveActivity': 0
    }
    assert not errors, '\n'.join(errors)
    page.screenshot(path=str(ARTIFACTS_DIR / 'demo-complete.png'), full_page=True)

    normal_after = context.new_page()
    normal_after.goto(BASE_URL, wait_until='networkidle')
    assert normal_after.locator('#dataset-switcher').input_value() == 'model-regression'
    assert normal_after.locator('#demo-overlay').count() == 0
    normal_after.close()

    mobile_context = browser.new_context(viewport={'width': 390, 'height': 844})
    mobile_page = mobile_context.new_page()
    mobile_page.goto(f'{BASE_URL}?demo=1', wait_until='networkidle')
    mobile_page.locator('#demo-pause-btn').click()
    mobile_layout = mobile_page.evaluate(r"""() => {
      const panel = document.querySelector('#demo-overlay').getBoundingClientRect();
      return {
        width: panel.width,
        height: panel.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        bodyScrollWidth: document.body.scrollWidth,
        paddingBottom: parseFloat(getComputedStyle(document.querySelector('.workspace')).paddingBottom)
      };
    }""")
    assert mobile_layout['width'] == mobile_layout['viewportWidth']
    assert mobile_layout['height'] <= mobile_layout['viewportHeight'] * 0.45 + 1
    assert mobile_layout['bodyScrollWidth'] <= mobile_layout['viewportWidth']
    assert mobile_layout['paddingBottom'] >= mobile_layout['height']
    mobile_context.close()

    clean_context = browser.new_context()
    clean_page = clean_context.new_page()
    clean_page.goto(BASE_URL, wait_until='networkidle')
    assert clean_page.locator('#demo-overlay').count() == 0
    assert clean_page.evaluate("window.InvestigationCanvas.store.state.activeTab") == 'explore'
    clean_context.close()
    context.close()
    browser.close()

print('Demo E2E passed; zero-click run completed with real tools and normal URL stayed idle')
