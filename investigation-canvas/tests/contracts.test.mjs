import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('app shell is wired', () => {
  assert.match(html, /id="app"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.match(html, /styles\.css/);
});

test('all major investigation surfaces exist', () => {
  for (const name of ['Explore','Hypotheses','Evidence','Canvas','Provenance']) assert.match(app, new RegExp(name));
});

test('three deterministic scenarios exist', () => {
  for (const name of ['Checkout conversion regression','ML model quality regression','Suspicious transaction network']) assert.match(app, new RegExp(name));
});

test('mixed evidence types exist', () => {
  for (const type of ["type:'document'","type:'log'","type:'image'","type:'map'"]) assert.match(app, new RegExp(type.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('hypotheses include falsification and counterevidence', () => {
  assert.match(app, /falsify:/);
  assert.match(app, /find_counterevidence/);
  assert.match(app, /Evidence against/);
});

test('WebMCP surface is broad', () => {
  const names = [...app.matchAll(/\['([a-z0-9_]+)',(?:true|false)/g)].map(m => m[1]);
  assert.ok(names.length >= 40, `expected >= 40 tools, found ${names.length}`);
  assert.equal(new Set(names).size, names.length);
  for (const required of ['describe_workspace','set_selection','rank_correlations','search_evidence','create_hypothesis','find_counterevidence','create_canvas_view','branch_investigation','get_activity_provenance']) assert.ok(names.includes(required), required);
});

test('WebMCP annotations cover read-only and untrusted content', () => {
  assert.match(app, /readOnlyHint/);
  assert.match(app, /untrustedContentHint/);
});

test('workspace has state history, branches and persistence', () => {
  assert.match(app, /localStorage/);
  assert.match(app, /state\.history/);
  assert.match(app, /state\.future/);
  assert.match(app, /state\.branches/);
});

test('responsive CSS has narrow breakpoints and canvas fallback', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /\.canvas-card\{position:relative!important/);
});
