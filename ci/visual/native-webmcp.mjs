import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const chromePath = process.env.CHROME_PATH;
if (!chromePath) throw new Error('CHROME_PATH is required');
const baseURL = process.env.NATIVE_PROBE_URL || 'http://127.0.0.1:4174/';
const out = path.resolve('artifacts/native-webmcp');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

const report = { chromePath, baseURL, runs: [] };

async function probe(name, args = []) {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 });
  const result = await page.evaluate(async () => {
    const exists = !!document.modelContext;
    const registerToolType = typeof document.modelContext?.registerTool;
    let registration = { attempted: false, success: false, error: null };
    if (registerToolType === 'function') {
      registration.attempted = true;
      try {
        document.modelContext.registerTool({
          name: 'ci_native_probe',
          description: 'Temporary CI probe tool',
          inputSchema: { type: 'object', properties: {} },
          execute: async () => ({ content: [{ type: 'text', text: 'ok' }] })
        });
        registration.success = true;
      } catch (e) {
        registration.error = String(e?.stack || e);
      }
    }
    const status = document.querySelector('#status');
    const detail = document.querySelector('#detail');
    if (status) status.textContent = exists ? 'modelContext present' : 'modelContext absent';
    if (detail) detail.textContent = `registerTool=${registerToolType}; registration=${registration.success ? 'ok' : registration.error || 'not attempted'}`;
    return {
      secureContext: globalThis.isSecureContext,
      exists,
      registerToolType,
      registration,
      userAgent: navigator.userAgent
    };
  });
  const shot = path.join(out, `${name}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  report.runs.push({ name, args, ...result, consoleErrors, screenshot: shot });
  await browser.close();
  return result;
}

const normal = await probe('00-chrome152-default', []);
const enabled = await probe('01-chrome152-enable-webmcp', ['--enable-features=WebMCP']);
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));

if (!enabled.exists || enabled.registerToolType !== 'function') {
  throw new Error(`Chrome native WebMCP probe failed even with --enable-features=WebMCP: ${JSON.stringify(enabled)}`);
}
if (!enabled.registration.success) {
  throw new Error(`Chrome exposes modelContext but registerTool failed: ${enabled.registration.error}`);
}
console.log(JSON.stringify(report, null, 2));
