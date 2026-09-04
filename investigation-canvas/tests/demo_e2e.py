import os
import re
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
    elif Path('/usr/bin/google-chrome').exists():
        launch_options['executable_path'] = '/usr/bin/google-chrome'
    elif Path('/usr/bin/chromium').exists():
        launch_options['executable_path'] = '/usr/bin/chromium'
    browser = p.chromium.launch(**launch_options)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()

    # Provide document.modelContext bridge mock to verify 48 registered tools
    page.add_init_script("""
      window.__registeredTools = [];
      Object.defineProperty(document, 'modelContext', { configurable: true, value: {
        registerTool: async (tool) => { window.__registeredTools.push(tool); },
        getTools: async () => window.__registeredTools
      }});
    """)

    # 1. Normal clean app: restrained entry button, no mounted example UI
    page.goto(BASE_URL, wait_until='networkidle')

    btn = page.locator('#example-workflow-btn')
    assert btn.count() == 1
    assert btn.inner_text().strip() == 'Do example'
    assert page.locator('.mission-rail').count() == 0
    assert page.locator('.modal.example-chooser-modal').count() == 0
    assert page.locator('.demo-overlay').count() == 0
    assert page.locator('.demo-cursor').count() == 0

    # Verify WebMCP tool registration count is 48
    registered_count = page.evaluate("() => window.__registeredTools?.length || 0")
    assert registered_count == 48, f"Expected 48 registered tools, found {registered_count}"

    # 2. Click opens compact gallery of the 3 existing datasets
    btn.click()
    page.wait_for_selector('.modal.example-chooser-modal')
    cards = page.locator('.example-card')
    assert cards.count() == 3

    # Check Checkout card (Recommended)
    checkout_card = page.locator('.example-card[data-pack-id="checkout"]')
    assert checkout_card.count() == 1
    assert checkout_card.locator('.example-badge.recommended').count() == 1
    assert '720 telemetry records' in checkout_card.inner_text()
    assert '8 evidence docs' in checkout_card.inner_text()
    assert '10 entities' in checkout_card.inner_text()
    assert 'Safari 20.2' in checkout_card.inner_text()

    # Check Model card
    model_card = page.locator('.example-card[data-pack-id="model"]')
    assert model_card.count() == 1
    assert '420 training runs' in model_card.inner_text()
    assert '6 evidence docs' in model_card.inner_text()

    # Check Fraud card
    fraud_card = page.locator('.example-card[data-pack-id="fraud"]')
    assert fraud_card.count() == 1
    assert '560 transactions' in fraud_card.inner_text()
    assert '6 evidence docs' in fraud_card.inner_text()

    # 3. Select Checkout card: gallery closes, calm side mission rail opens, zero auto tool action
    checkout_card.locator('.example-start-btn').click()
    page.wait_for_selector('.mission-rail')
    assert page.locator('.modal.example-chooser-modal').count() == 0

    # Verify zero automatic agent actions or simulated cursors
    activity = page.evaluate("() => window.InvestigationCanvas.store.state.activity")
    assert not any(a.get('source') == 'agent' for a in activity), "No agent activity should run automatically"
    assert page.locator('.demo-cursor').count() == 0

    # 4. Prompt presence, comprehensive disclosure, and handoff copy
    rail = page.locator('.mission-rail')
    assert rail.locator('.webmcp-status-card').count() == 1
    assert 'WebMCP ready — 48 tools registered' in rail.inner_text()

    # Handoff instructions
    assert 'When this page is open in ChatGPT\'s in-app browser' in rail.inner_text()
    assert 'Chrome with WebMCP enabled' in rail.inner_text()
    assert 'copies the prompt to your clipboard but does not send it' in rail.inner_text()

    # Scenario prompt
    concise_card = rail.locator('.primary-prompt-card')
    assert concise_card.count() == 1
    assert concise_card.locator('.copy-prompt-btn').count() == 1

    # Comprehensive prompt disclosure
    disclosure = rail.locator('.comprehensive-prompt-disclosure')
    assert disclosure.count() == 1
    disclosure.locator('.disclosure-toggle').click()
    comp_prompt_text = disclosure.locator('.prompt-content-pre').inner_text()

    # Check comprehensive prompt coverage
    assert re.search(r'dataset.*schema.*baseline', comp_prompt_text, re.I)
    assert re.search(r'search.*filter.*selection', comp_prompt_text, re.I)
    assert re.search(r'compare.*selection to the rest', comp_prompt_text, re.I)
    assert re.search(r'discriminating features.*correlations.*outliers', comp_prompt_text, re.I)
    assert re.search(r'evidence.*trust.*graph.*counterevidence', comp_prompt_text, re.I)
    assert re.search(r'competing hypotheses.*confidence.*fork', comp_prompt_text, re.I)
    assert re.search(r'findings.*causal links', comp_prompt_text, re.I)
    assert re.search(r'canvas views.*annotation', comp_prompt_text, re.I)
    assert re.search(r'saved.*view.*branch', comp_prompt_text, re.I)
    assert re.search(r'provenance.*verified evidence.*inferential conclusions', comp_prompt_text, re.I)

    # 5. Switching packs resets isolated example state
    rail.locator('#mission-switch-pack-btn').click()
    page.wait_for_selector('.modal.example-chooser-modal')
    page.locator('.example-card[data-pack-id="model"] .example-start-btn').click()
    page.wait_for_selector('.mission-rail')
    assert 'Model quality regression' in page.locator('.mission-rail-title').inner_text()
    dataset_id = page.evaluate("() => window.InvestigationCanvas.store.state.dataset.id")
    assert dataset_id == 'model-regression'

    # 6. Exit restores exact in-memory store and byte-identical normal localStorage
    page.goto(BASE_URL, wait_until='networkidle')
    # Pre-condition: user performs specific changes in normal workspace
    page.evaluate(r"""() => {
      const store = window.InvestigationCanvas.store;
      store.setSearch('persisted-normal-query');
      store.persist();
    }""")
    normal_storage_before = page.evaluate("() => localStorage.getItem('investigation-canvas:workspace:v1')")

    # Enter example via URL parameter ?example=checkout
    page.goto(f'{BASE_URL}?example=checkout', wait_until='networkidle')
    assert page.locator('.mission-rail').count() == 1

    # Mutate state during example
    page.evaluate(r"""() => {
      const store = window.InvestigationCanvas.store;
      store.setSearch('example-isolated-query');
      store.setSelection(['req-0001']);
      store.persist();
    }""")

    # Verify normal localStorage remained untouched during example
    normal_storage_during = page.evaluate("() => localStorage.getItem('investigation-canvas:workspace:v1')")
    assert normal_storage_during == normal_storage_before

    # Click Exit example
    page.locator('#mission-exit-btn').click()
    assert page.locator('.mission-rail').count() == 0

    # Verify URL parameter removed
    current_url = page.url
    assert 'example=' not in current_url

    # Verify byte-identical restoration of normal localStorage
    normal_storage_after = page.evaluate("() => localStorage.getItem('investigation-canvas:workspace:v1')")
    assert normal_storage_after == normal_storage_before

    # Verify in-memory store restored
    restored_search = page.evaluate("() => window.InvestigationCanvas.store.state.search")
    assert restored_search == 'persisted-normal-query'

    context.close()
    browser.close()
    print("ALL PLAYWRIGHT E2E ASSERTIONS PASSED!")
