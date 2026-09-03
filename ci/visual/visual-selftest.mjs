import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('artifacts/selftest');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const diagnostics = { screenshots: [], consoleErrors: [], checks: [] };

async function runViewport(name, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') diagnostics.consoleErrors.push(`${name}: ${msg.text()}`); });
  page.on('pageerror', err => diagnostics.consoleErrors.push(`${name}: ${err.message}`));

  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box} body{margin:0;background:#0f1319;color:#edf2ff;font:14px system-ui;padding:18px}
    header{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}
    .card{border:1px solid #2d3645;border-radius:12px;background:#151b24;padding:16px;min-height:140px}.wide{grid-column:span 2}
    button{background:#28344a;color:white;border:1px solid #465773;border-radius:9px;padding:9px 12px}#state{font-weight:700}
    @media(max-width:600px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}header{align-items:stretch}button{flex:1}}
  </style>
  <header><strong>Visual CI harness</strong><span id="state">initial</span><button id="advance">Advance state</button></header>
  <main class="grid"><section class="card wide">Timeline / scatter surface</section><section class="card">Evidence</section><section class="card">Hypotheses</section><section class="card wide">Provenance</section></main>
  <script>document.querySelector('#advance').onclick=()=>{document.querySelector('#state').textContent='selected';document.querySelectorAll('.card')[0].textContent='Selected cluster: 42 records';}</script>`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  diagnostics.checks.push({ name: `${name}-initial-horizontal-overflow`, value: overflow, pass: overflow <= 2 });
  if (overflow > 2) throw new Error(`${name} has horizontal overflow: ${overflow}px`);

  const initial = path.join(out, `${name}-00-initial.png`);
  await page.screenshot({ path: initial, fullPage: true });
  diagnostics.screenshots.push(initial);

  await page.getByRole('button', { name: 'Advance state' }).click();
  if ((await page.locator('#state').textContent()) !== 'selected') throw new Error(`${name} interaction did not mutate state`);
  const selected = path.join(out, `${name}-01-selected.png`);
  await page.screenshot({ path: selected, fullPage: true });
  diagnostics.screenshots.push(selected);

  await context.close();
}

await runViewport('desktop-1440x1000', 1440, 1000);
await runViewport('laptop-1280x800', 1280, 800);
await runViewport('mobile-390x844', 390, 844);
await runViewport('mobile-360x800', 360, 800);
await browser.close();

if (diagnostics.consoleErrors.length) throw new Error(`Console errors: ${diagnostics.consoleErrors.join('\n')}`);
await fs.writeFile(path.join(out, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
console.log(`visual harness self-test passed with ${diagnostics.screenshots.length} screenshots`);
