# Investigation Canvas — Handover

_Last verified production baseline before this documentation-only handover: `4411049fc5b4773a98f40b50741e800c062d30ed` on `main`._

## 1. What this project is

Investigation Canvas is a static WebMCP-powered visual reasoning workspace. A human and a browser agent operate on the same investigation state rather than using separate UI and agent representations.

The core product idea is simple:

- humans are good at noticing patterns, exceptions, spatial relationships, and surprising evidence in rich visual interfaces;
- agents are good at searching structured state, comparing many records, tracing relationships, ranking hypotheses, and performing repetitive analysis;
- WebMCP exposes the application's semantic state directly to the agent, while the normal interface renders the exact same state for the human.

This is intentionally not a chat box attached to a dashboard. Selection, filters, evidence, hypotheses, findings, causal links, saved views, branches, annotations, and canvas geometry are all shared application state.

## 2. Authoritative branch and repository state

**Use `main` as the only production authority.**

All current production application code, tests, browser harnesses, WebMCP verification, visual fixes, and permanent CI live on `main`.

Several historical branches remain because the project was recovered, reconstructed, browser-tested, and patched incrementally. They are useful archaeology but should not be treated as newer production work:

- `investigation-canvas-reconstructed-backup` — historical backup; fully behind `main`.
- `recover-original-investigation-canvas` — historical recovery branch; fully behind `main`.
- `fix-investigation-canvas-visuals` — visual-fix branch merged through PR #6; `main` is ahead.
- `investigation-canvas-ci-run` — contains only a CI trigger marker not needed in production.
- `verify-modernized-investigation-ci` — CI verification branch; its PR was deliberately closed without merge because its only extra file was a trigger marker.
- `webmcp-visual-ci` — historical branch where the reusable browser harness was developed; the actual harness files are already present on `main`.
- `webmcp-chrome-cft` — historical Chrome-download experiment. Its useful purpose is superseded by the integrated native Chrome 152 WebMCP probe in `.github/workflows/webmcp-visual-ci.yml`.
- `investigation-canvas-source` — an older parallel source/recovery line. It has unique historical commit SHAs, but its app snapshot is earlier/smaller than the current production app. Do not merge it wholesale.

If a future maintainer is unsure whether something was lost, compare file contents against `main`; do not infer from branch divergence alone because several recovered features were later reapplied or merged under different commit SHAs.

## 3. Project layout

### Application

- `investigation-canvas/index.html` — static entry point.
- `investigation-canvas/styles.css` — complete responsive visual system, including spatial-canvas and mobile behavior.
- `investigation-canvas/src/sampleData.js` — deterministic built-in investigations.
- `investigation-canvas/src/core.js` — pure analytics and data utilities: filtering, schema inference, CSV parsing, correlations, outliers, comparisons, discriminating features, etc.
- `investigation-canvas/src/store.js` — canonical state model, persistence, undo/redo, hypotheses, evidence links, findings, causal links, saved views, branches, import/export, canvas state.
- `investigation-canvas/src/workspace.js` — spatial-canvas rendering/helpers, rich evidence rendering, and workspace interaction helpers.
- `investigation-canvas/src/webmcp.js` — WebMCP catalog and registration.
- `investigation-canvas/src/app.js` — top-level rendering and human UI event wiring.

### Tests

- `investigation-canvas/tests/*.test.js` / `*.test.mjs` — 93 unit/integration/contract tests at the verified baseline.
- `investigation-canvas/tests/e2e.py` — permanent Playwright browser E2E, including visual/layout regression assertions for desktop and mobile.
- `recovery/webmcp-kit-browser-verify.py` — all-tool browser verification: registers and invokes all 48 WebMCP tools and checks visible shared-state effects.

### Browser/visual harness

- `ci/visual/package.json` — Playwright harness dependency definition.
- `ci/visual/visual-selftest.mjs` — harness self-test.
- `ci/visual/investigation-visual.mjs` — multi-state browser and screenshot automation for the full app.
- `ci/visual/native-webmcp.mjs` — native WebMCP probe.
- `ci/visual/native-fixture/index.html` — minimal fixture used by the native browser probe.

### Documentation

- `docs/ARCHITECTURE.md` — concise architecture overview.
- `docs/DEMO.md` — demo flow.
- `docs/SUBMISSION.md` — hackathon submission notes.
- `docs/HANDOVER.md` — this document.
- `docs/DEVLOG.md` — chronological development log.

### CI

- `.github/workflows/investigation-canvas-pr-ci.yml` — exact PR-merge-candidate verification for Investigation Canvas changes.
- `.github/workflows/webmcp-visual-ci.yml` — reusable browser harness, multi-state visual automation, and native Chrome 152 WebMCP probe.

Both permanent workflows were modernized to current Node-24-era GitHub actions after the production visual fixes were merged.

## 4. Architecture and invariants

The most important architectural rule is:

> **The human UI and the WebMCP tool surface are two interfaces over one InvestigationStore.**

Do not introduce separate agent-only state for objects that should be inspectable by the human.

Important shared state includes:

- current dataset and visible records;
- filters and free-text record search;
- selection/shared attention;
- chart dimensions;
- focused record/document/graph node;
- hypotheses, confidence, status, falsification questions, parent forks;
- supporting and contradicting evidence attachments;
- findings and causal links;
- workspace annotations;
- saved analysis views;
- investigation branches;
- undo/redo history;
- activity/provenance trail;
- spatial-canvas views, links, position, size, focus, pan, and zoom.

The UI re-renders from store state. Agent actions mutate the same store and therefore become visible without a second synchronization layer.

## 5. WebMCP surface

The verified production catalog contains **48 tools**.

The surface spans:

- workspace description and record access;
- selection/shared attention;
- filtering/search;
- statistical comparison and ranking;
- evidence discovery/focus;
- relationship graph inspection/focus;
- hypothesis creation, updates, forks, falsification/counterevidence;
- evidence attachment;
- findings and causal links;
- spatial-canvas inspection and mutation;
- annotations;
- saved views and investigation branches;
- provenance.

Representative tools include:

`describe_workspace`, `list_records`, `get_record`, `query_records`, `get_selection`, `set_selection`, `select_where`, `compare_selection_to_rest`, `compare_queries`, `rank_discriminating_features`, `rank_correlations`, `find_outliers`, `search_evidence`, `focus_evidence`, `get_relationship_graph`, `focus_graph_node`, `create_hypothesis`, `update_hypothesis`, `fork_hypothesis`, `find_counterevidence`, `attach_evidence_to_hypothesis`, `create_finding`, `add_causal_link`, `get_canvas_state`, `create_canvas_view`, `update_canvas_view`, `link_canvas_views`, `arrange_canvas`, `save_analysis_view`, `branch_investigation`, and `get_activity_provenance`.

Tool metadata matters. Read-only tools use `readOnlyHint: true`; tools returning potentially third-party/source evidence use `untrustedContentHint: true`.

## 6. Built-in investigations

There are three deterministic seeded scenarios:

1. **Checkout conversion regression** — best primary demo. Contains a strong Safari/mobile regression plus an independent desktop pricing-experiment regression, which makes it useful for showing competing hypotheses and counterexamples.
2. **ML model quality regression** — useful for experiment-analysis style debugging and media/evidence inspection.
3. **Suspicious transaction network** — useful for graph reasoning, concentration analysis, and evidence trust boundaries.

Each scenario includes structured records and richer evidence types such as image-style captures, map-style evidence, and log streams.

## 7. Recommended demo

Use **Checkout conversion regression**.

Suggested prompt:

> Conversion dropped this week. Investigate the cause. Maintain at least two competing hypotheses, show me the evidence visually, and try to falsify your leading explanation before concluding.

A strong sequence is:

1. Agent describes the workspace.
2. Agent analyzes conversion/error relationships.
3. Agent selects the affected Safari/mobile segment.
4. The shared selection becomes visible in the linked views.
5. Agent opens release/support evidence.
6. Agent creates at least two competing hypotheses.
7. Agent attaches supporting and contradicting evidence.
8. Agent explicitly searches for counterevidence before concluding.
9. Agent leaves findings/reasoning artifacts on the spatial canvas.
10. Human selects anomalous desktop points and challenges the result.
11. Agent discovers the independent pricing experiment regression.
12. Provenance shows the full human + agent reasoning trail.

The demo should emphasize **shared attention and inspectable reasoning**, not merely the number of tools.

## 8. Running locally

The app has no build step and no runtime package dependency.

From `investigation-canvas/`:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

The normal UI works in ordinary browsers. WebMCP tool exposure requires a WebMCP-capable browser environment.

## 9. Test commands

### Unit/integration/contract suite

From `investigation-canvas/`:

```bash
npm test
```

Verified baseline: **93 passed, 0 failed**.

### Browser E2E

Requires Chromium/Playwright and the app served on port 4173:

```bash
python investigation-canvas/tests/e2e.py
```

The E2E checks application behavior plus permanent layout regressions, including mobile overflow, canvas borders, map-label containment, responsive signal layout, and finite chart geometry.

### WebMCP browser verification

```bash
python recovery/webmcp-kit-browser-verify.py
```

Verified baseline: **48 registered, 48 invoked, 0 failed**, with visible UI effects for selection, filters, hypotheses, and agent-created canvas views.

### Reusable visual harness

Use `.github/workflows/webmcp-visual-ci.yml` as the canonical automation path. It validates:

- harness self-test;
- application source contracts;
- multi-state browser automation/screenshots;
- native WebMCP behavior in Chrome for Testing 152.

## 10. Final visual fixes that must not regress

A browser audit found nine visual/layout defects. The merged fixes cover:

- missing spatial-canvas borders caused by using the wrong CSS variable;
- zero-span scatter scaling producing invalid coordinates;
- zero-span timeline scaling producing invalid coordinates;
- mobile Investigation Signals overflow/layout;
- narrow-screen chart control layout;
- evidence heading/search responsiveness;
- narrow form/evidence-column layout;
- map normalization using real point extents and labels overflowing the right edge;
- mobile stacked-canvas pointer interactions mutating hidden desktop geometry.

These are now partially enforced by permanent browser assertions. If any rendering code is touched, run the browser suites, not just `npm test`.

## 11. CI history and current state

The original PR CI had a subtle failure: it used a shallow PR-merge checkout and then ran `git diff --check origin/main...HEAD`, but `origin/main` had not been fetched. The app never reached its tests. The workflow now uses full fetch depth, and this exact failure mode is fixed.

The permanent workflows were also cleaned up after merge:

- `actions/checkout` upgraded to `v7.0.1`;
- `actions/setup-node` upgraded to `v7.0.0`;
- `actions/upload-artifact` upgraded to `v7.0.1`;
- the Playwright executable lookup no longer starts/closes a driver merely to query `executable_path`, eliminating a transient `TargetClosedError` warning;
- the previous Node 20 action-runtime deprecation warnings are gone.

A CI-only verification PR was opened solely to exercise the modernized workflow definitions, both permanent workflows passed, and the PR was closed without merge so its trigger file never entered `main`.

## 12. Persistence and data model notes

The application stores workspace state in the browser. It supports:

- browser-local persistence;
- CSV and JSON dataset import with schema inference;
- full Investigation Canvas JSON export/import;
- saved views;
- restorable branches;
- undo/redo.

There is deliberately no backend, account system, server database, or multiplayer synchronization layer in the hackathon build.

## 13. Known limitations / deliberate tradeoffs

These are not currently considered release blockers:

- **No backend persistence.** State is local to the browser unless exported.
- **No real-time multi-user collaboration.** “Human + agent collaboration” is same-browser shared state, not multiple people over a network.
- **Static app architecture.** This is excellent for reliability and demo portability but will eventually constrain modularity if the product grows substantially.
- **Hand-built SVG/DOM charts.** Keeps dependencies low and semantics obvious, but sophisticated visualization features will require more renderer code.
- **Schematic map evidence.** The built-in map view is a lightweight evidence visualization, not a full GIS/map provider.
- **WebMCP availability is browser-dependent.** Ordinary browsers still run the app but do not expose the semantic agent tool surface.
- **Trust hints are advisory metadata.** `untrustedContentHint` helps the agent reason about source text; it is not a security sandbox.
- **Large datasets are not yet virtualized aggressively.** The current demos are intentionally bounded; very large production imports would need table/rendering virtualization and possibly worker-based analysis.

## 14. Safe next steps

If continuing product development, the highest-value areas are:

1. **Submission/demo polish** — tighten the primary scenario, visual storytelling, onboarding, and <3-minute judge flow before adding broad new features.
2. **Agent reasoning UX** — make hypothesis/evidence/counterevidence transitions even easier to audit visually.
3. **Import adapters** — logs, experiment runs, traces, document bundles, and other evidence sources, while preserving one shared semantic model.
4. **Performance** — virtualized tables, incremental analysis, and workers for genuinely large datasets.
5. **Durable collaboration** — optional backend/project persistence only if moving beyond the hackathon prototype.
6. **Tool ergonomics** — continue to prefer high-level semantic operations over many tiny DOM-like tools.

Avoid expanding the product into generic chat, generic dashboarding, or arbitrary agent automation unless the shared visual reasoning loop remains clearly stronger than a normal MCP server.

## 15. Release checklist

Before any submission/release build:

1. Confirm changes are on `main` or a clean PR against `main`.
2. Run `npm test` and require 93/93 or higher.
3. Run the permanent browser E2E.
4. Run the WebMCP all-tool verifier.
5. Run multi-state visual automation.
6. Confirm the native Chrome 152 WebMCP probe remains green.
7. Inspect generated desktop/mobile screenshots for obvious visual regressions.
8. Verify the checkout-regression demo still exposes both the primary Safari issue and the independent desktop experiment issue.
9. Check the README, `DEMO.md`, and `SUBMISSION.md` for claims that no longer match implementation.
10. Do not merge temporary trigger/audit helpers into production.

## 16. What is considered “done” at handover

At the handover baseline:

- the complete production app is pushed to GitHub;
- visual fixes from PR #6 are merged;
- 93 unit/integration/contract tests pass;
- browser layout regression checks pass;
- 48/48 WebMCP tools register and execute in verification;
- multi-state visual/browser automation passes;
- native Chrome 152 WebMCP probing passes;
- permanent CI is modernized and warning-clean for the issues identified during this work;
- temporary audit/apply scaffolding is not part of `main`.

The code is in a good state for submission polish or continued feature development.