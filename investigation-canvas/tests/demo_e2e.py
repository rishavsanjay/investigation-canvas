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
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
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
    assert not errors, '\n'.join(errors)
    page.screenshot(path=str(ARTIFACTS_DIR / 'demo-complete.png'), full_page=True)

    clean_context = browser.new_context()
    clean_page = clean_context.new_page()
    clean_page.goto(BASE_URL, wait_until='networkidle')
    assert clean_page.locator('#demo-overlay').count() == 0
    assert clean_page.evaluate("window.InvestigationCanvas.store.state.activeTab") == 'explore'
    clean_context.close()
    context.close()
    browser.close()

print('Demo E2E passed; zero-click run completed with real tools and normal URL stayed idle')
