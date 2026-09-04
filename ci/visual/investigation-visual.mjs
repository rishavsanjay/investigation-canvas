import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const out = path.resolve('artifacts/investigation-canvas');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

const diagnostics = {
  baseURL,
  screenshots: [],
  consoleErrors: [],
  pageErrors: [],
  requestsFailed: [],
  checks: [],
  registeredTools: [],
  stateCaptures: []
};

function recordCheck(name, pass, detail = null) {
  diagnostics.checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
}

async function screenshot(page, name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  diagnostics.screenshots.push(file);
}

async function noHorizontalOverflow(page, name) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body?.scrollWidth || 0
  }));
  const overflow = Math.max(m.scrollWidth, m.bodyScrollWidth) - m.clientWidth;
  recordCheck(`${name}: horizontal overflow <= 3px`, overflow <= 3, JSON.stringify({ ...m, overflow }));
}

async function visibleText(page, text) {
  return (await page.getByText(text, { exact: false }).count()) > 0;
}

async function maybeClickText(page, text) {
  const loc = page.getByText(text, { exact: false }).filter({ visible: true }).first();
  if (await loc.count()) {
    try {
      await loc.click({ timeout: 1500 });
      await page.waitForTimeout(250);
      return true;
    } catch {}
  }
  return false;
}

async function clickTab(page, id) {
  const tab = page.locator(`[data-tab="${id}"]`);
  if (!(await tab.count())) return false;
  await tab.click();
  await page.waitForTimeout(250);
  return true;
}

async function captureWorkspaceState(page, label) {
  const state = await page.evaluate((label) => ({
    label,
    title: document.title,
    url: location.href,
    textSample: (document.body?.innerText || '').slice(0, 1400),
    activeElement: document.activeElement?.tagName || null,
    buttons: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null).slice(0, 80).map(x => x.textContent?.trim()).filter(Boolean),
    selects: [...document.querySelectorAll('select')].filter(x => x.offsetParent !== null).map(x => ({ value: x.value, options: [...x.options].map(o => o.textContent?.trim()) })),
    visibleCards: document.querySelectorAll('[class*="card"],section,article').length
  }), label);
  diagnostics.stateCaptures.push(state);
}

const browser = await chromium.launch({ headless: true });

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  // Capture WebMCP registration deterministically even when the CI browser does not expose native WebMCP.
  await context.addInitScript(() => {
    globalThis.__webmcpCaptured = [];
    const registry = {
      registerTool(tool, options) {
        globalThis.__webmcpCaptured.push({
          name: tool?.name,
          description: tool?.description,
          inputSchema: tool?.inputSchema,
          annotations: tool?.annotations,
          executeType: typeof tool?.execute,
          hasSignal: !!options?.signal
        });
        return undefined;
      }
    };
    try {
      if (!document.modelContext) Object.defineProperty(document, 'modelContext', { configurable: true, value: registry });
    } catch {}
  });

  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  page.on('console', msg => { if (msg.type() === 'error') diagnostics.consoleErrors.push(msg.text()); });
  page.on('pageerror', err => diagnostics.pageErrors.push(err.message));
  page.on('requestfailed', req => diagnostics.requestsFailed.push({ url: req.url(), failure: req.failure()?.errorText }));

  await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}' });
  await page.waitForTimeout(500);

  recordCheck('title contains Investigation Canvas', /Investigation Canvas/i.test(await page.title()), await page.title());
  recordCheck('#app exists', (await page.locator('#app').count()) === 1);
  recordCheck('body has meaningful rendered text', (await page.locator('body').innerText()).length > 500);
  await noHorizontalOverflow(page, 'desktop-initial');
  await captureWorkspaceState(page, 'desktop-initial');
  await screenshot(page, '00-desktop-initial');

  // WebMCP registration contract.
  const tools = await page.evaluate(() => globalThis.__webmcpCaptured || []);
  diagnostics.registeredTools = tools;
  recordCheck('at least 35 semantic WebMCP tools registered', tools.filter(x => x.name).length >= 35, `${tools.length} captured`);
  recordCheck('registered tools have unique names', new Set(tools.map(x => x.name)).size === tools.length);
  recordCheck('at least one read-only annotated tool', tools.some(x => x.annotations?.readOnlyHint === true));
  recordCheck('at least one untrusted-content annotated tool', tools.some(x => x.annotations?.untrustedContentHint === true));

  // Check the major product surfaces exist in the rendered app.
  for (const surface of ['Explore', 'Hypotheses', 'Evidence', 'Provenance']) {
    recordCheck(`surface visible: ${surface}`, await visibleText(page, surface));
  }

  // Shared-attention state: prefer a real table record click because it is stable even when scatter marks overlap.
  const row = page.locator('tbody tr').first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(250);
    await captureWorkspaceState(page, 'record-selected');
    await screenshot(page, '01-record-selected');
  }

  // Capture the major investigation modes.
  if (await clickTab(page, 'hypotheses')) {
    await captureWorkspaceState(page, 'hypotheses');
    await screenshot(page, '02-hypotheses');
  }
  if (await clickTab(page, 'evidence')) {
    await captureWorkspaceState(page, 'evidence');
    await screenshot(page, '03-evidence');
  }
  if (await clickTab(page, 'provenance')) {
    await captureWorkspaceState(page, 'provenance');
    await screenshot(page, '04-provenance');
  }

  // New spatial/freeform workbench is optional in older snapshots but mandatory once present.
  if (await clickTab(page, 'canvas')) {
    recordCheck('spatial canvas view is active', await page.locator('[data-tab="canvas"].active').count() === 1);
    recordCheck('spatial canvas rendered', await page.locator('.canvas-viewport').count() === 1);
    await captureWorkspaceState(page, 'spatial-canvas');
    await screenshot(page, '05-spatial-canvas');
  }

  // Scenario switching: select the suspicious-network scenario if exposed by a select.
  const scenarioSelects = page.locator('select');
  for (let i = 0; i < await scenarioSelects.count(); i++) {
    const s = scenarioSelects.nth(i);
    const opts = await s.locator('option').allTextContents();
    const target = opts.find(x => /Suspicious transaction network/i.test(x));
    if (target) {
      await s.selectOption({ label: target });
      await page.waitForTimeout(400);
      const scenarioTitle = await page.locator('.dataset-title').innerText();
      recordCheck('scenario switched to suspicious transaction network', /Suspicious transaction network/i.test(scenarioTitle), scenarioTitle);
      await captureWorkspaceState(page, 'scenario-suspicious-network');
      await screenshot(page, '06-suspicious-transaction-network');
    }
  }

  await noHorizontalOverflow(page, 'desktop-final');
  await context.close();
}

async function runMobile() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  page.on('console', msg => { if (msg.type() === 'error') diagnostics.consoleErrors.push(`mobile: ${msg.text()}`); });
  page.on('pageerror', err => diagnostics.pageErrors.push(`mobile: ${err.message}`));
  await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}' });
  await page.waitForTimeout(400);
  await noHorizontalOverflow(page, 'mobile-390');

  // Header collision sanity check: visible top-level buttons should not have large pairwise intersections.
  const boxes = await page.locator('header button:visible, header [role="button"]:visible').evaluateAll(nodes => nodes.slice(0, 25).map(n => {
    const r = n.getBoundingClientRect();
    return { text: n.textContent?.trim(), x:r.x,y:r.y,w:r.width,h:r.height };
  }));
  let severeOverlap = null;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a=boxes[i], b=boxes[j];
    const iw=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
    const ih=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
    const overlap=iw*ih;
    const minArea=Math.min(a.w*a.h,b.w*b.h);
    if (minArea > 0 && overlap/minArea > 0.35) severeOverlap={a,b,ratio:overlap/minArea};
  }
  recordCheck('mobile header controls do not substantially overlap', !severeOverlap, severeOverlap ? JSON.stringify(severeOverlap) : null);
  await captureWorkspaceState(page, 'mobile-initial');
  await screenshot(page, '10-mobile-390-initial');

  // Narrower viewport catches breakpoint regressions.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(250);
  await noHorizontalOverflow(page, 'mobile-360');
  await screenshot(page, '11-mobile-360-narrow');
  await context.close();
}

try {
  await runDesktop();
  await runMobile();
} finally {
  await browser.close();
  await fs.writeFile(path.join(out, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
}

recordCheck('no uncaught page errors', diagnostics.pageErrors.length === 0, diagnostics.pageErrors.join('\n'));
recordCheck('no failed same-origin app resource requests', diagnostics.requestsFailed.filter(x => x.url.startsWith(baseURL)).length === 0, JSON.stringify(diagnostics.requestsFailed));

// Console errors are recorded but not all third-party/browser warnings should kill a demo build. Fail on obvious app exceptions.
const fatalConsole = diagnostics.consoleErrors.filter(x => /uncaught|typeerror|referenceerror|syntaxerror/i.test(x));
recordCheck('no fatal console exceptions', fatalConsole.length === 0, fatalConsole.join('\n'));
await fs.writeFile(path.join(out, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
console.log(`Investigation Canvas visual CI passed; ${diagnostics.screenshots.length} screenshots, ${diagnostics.registeredTools.length} WebMCP tools captured.`);
