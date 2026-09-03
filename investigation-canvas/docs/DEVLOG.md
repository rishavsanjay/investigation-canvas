# Investigation Canvas — Development Log

This log records the major product, architecture, recovery, implementation, testing, and release decisions that produced the current Investigation Canvas build. It is intentionally higher level than raw Git history: commits show *what changed*; this document preserves *why*.

## Product direction

### From “AI dashboard” to a shared visual reasoning surface

The project started from the observation that a strong WebMCP entry should not merely attach an agent to an existing-style web app. The more interesting interaction is a rich visual work surface that is already useful for a human, while the page exposes a semantic twin of that same state to an agent.

Several narrower directions were considered—workflow debugging, operations dashboards, ML experiment analysis, EDA/hardware review, state-machine tooling, schemas, simulation, and generic visualization semantics. The central pattern that survived the comparisons was:

> Human and agent should stand at the same control panel.

A useful test became:

- if the agent disappears, is the visual app still useful?
- if the GUI disappears, can the agent still perform serious work through semantic operations?
- when both exist, does the shared state make the combination materially better than either alone?

That led to the broader **Investigation OS / visual reasoning workspace** concept and eventually to Investigation Canvas.

### Why investigation rather than generation

The product deliberately emphasizes analysis, evidence, comparison, causal reasoning, and falsification rather than having the model generate precise CAD-like artifacts. Current models are much stronger at structured analysis than at exact geometric/model construction.

The application therefore gives the agent semantic operations over data, evidence, hypotheses, graphs, and views, while humans retain the visually rich reasoning surface.

## Initial application architecture

### One store, two interfaces

The core invariant was established early: the normal UI and WebMCP tools operate on the same deterministic `InvestigationStore`.

The state model includes records, visible subsets, filters, selection, dimensions, evidence focus, graph focus, hypotheses, evidence links, annotations, saved views, branches, history, and provenance.

This avoided two common failure modes:

1. an agent manipulating hidden state that the user cannot inspect;
2. a UI maintaining chart-local state that diverges from agent-visible state.

The UI re-renders from store state, so any mutation—human or agent—converges on one source of truth.

### Dependency-light rendering

The project intentionally avoided a large application framework and chart stack. Scatter plots, timelines, and graph-like views use small SVG renderers; tables and evidence are regular DOM.

Reasons:

- reduce build/dependency risk during judging;
- make record-to-mark semantics obvious;
- keep the app portable as a static site;
- keep browser automation deterministic;
- make WebMCP actions visibly affect normal application state without integration glue.

## Shared attention and linked analysis

Selection became the primary human-agent collaboration primitive.

A human can:

- click a point;
- brush a region;
- select a row;
- focus evidence.

The agent can use semantic tools such as `set_selection` and `select_where` to manipulate the same set of record IDs.

All linked views then update from that selection, and the application can automatically compare selected records with the rest of the visible dataset.

This interaction is one of the clearest demonstrations of why WebMCP matters: the agent does not need to reverse-engineer SVG pixels, and the human does not need to trust invisible agent state.

## Seeded investigations

Three deterministic scenarios were built to exercise different reasoning modes.

### Checkout conversion regression

Designed as the primary demo. It contains:

- a strong Safari/mobile conversion regression;
- related error-rate evidence;
- release/support evidence;
- an independent desktop pricing-experiment regression.

The independent second issue is intentional. It prevents a trivial “find one correlation and stop” demo and creates a natural moment where the human can challenge the leading explanation by selecting anomalous desktop points.

### ML model quality regression

Built to show experiment-analysis behavior, media/evidence inspection, comparisons, and regression diagnosis.

### Suspicious transaction network

Built to exercise graph relationships, concentration analysis, suspicious clusters, and trust boundaries around external evidence.

## Evidence model and trust boundary

Evidence documents were kept distinct from model reasoning. Documents have explicit trust metadata, and WebMCP tools returning potentially external/source text use `untrustedContentHint: true`.

This was a deliberate design choice: evidence should be something the agent reasons *about*, not instructions it blindly follows.

The fraud scenario includes explicitly unverified source material so the demo can show corroboration behavior rather than simple retrieval.

## Hypotheses, falsification, and durable reasoning

The investigation model was expanded beyond filters and charts into first-class reasoning artifacts.

Added concepts include:

- competing hypotheses;
- confidence and status;
- falsification questions;
- supporting evidence;
- contradicting evidence;
- explicit hypothesis forks;
- counterevidence discovery;
- persistent findings;
- causal links;
- reasoning artifacts rendered into the workspace.

The goal was to make agent work inspectable and revisable instead of leaving reasoning trapped inside chat text.

The recommended demo explicitly asks the agent to maintain at least two explanations and attempt to falsify its leader before concluding.

## Spatial investigation canvas

The workspace was expanded into a freeform spatial canvas.

Capabilities added include:

- movable views;
- resizable views;
- pan/zoom;
- grid arrangement;
- focused-view arrangement;
- linked canvas views;
- agent-created summary/analysis views;
- evidence, reasoning, graph, chart, table, image, map, and log-style views.

The canvas is not merely presentation. Geometry, focus, links, and created views are part of shared state and are exposed to WebMCP.

This pushed the product closer to a persistent visual reasoning artifact rather than a temporary dashboard.

## Rich evidence expansion

To ensure the system was not only “charts + text,” the built-in scenarios gained richer evidence representations:

- image-style captures with labeled regions;
- geospatial/map-style evidence;
- log-stream evidence.

These can appear both in the evidence library and in canvas views.

The goal was to demonstrate that the investigation model can unify heterogeneous evidence while still exposing agent-friendly semantic objects.

## WebMCP expansion

The initial tool surface was broadened as the state model matured.

The final verified catalog contains **48 tools** covering:

- workspace description;
- record retrieval/querying;
- selection/shared attention;
- filtering/search;
- summaries and group comparisons;
- discriminating features, correlations, and outliers;
- evidence retrieval/focus;
- graph inspection/focus;
- hypotheses and counterevidence;
- evidence attachment;
- findings and causal links;
- spatial-canvas creation/update/removal/focus/linking/arrangement;
- annotations;
- saved analysis views;
- investigation branching/restoration;
- provenance.

The later enhancement phase added 13 tools around canvas manipulation, rich evidence, findings, causal reasoning, hypothesis forks, and counterevidence, bringing the catalog to the final 48-tool surface.

Read-only metadata and untrusted-content metadata were treated as part of the contract, not cosmetic annotations.

## Persistence, history, and reproducibility

The store gained several features intended to make an investigation reproducible:

- browser-local persistence;
- undo/redo;
- saved analysis views;
- restorable investigation branches;
- full JSON export/import;
- CSV/JSON dataset import with schema inference;
- human + agent provenance/activity trail.

These features reinforce the product concept: the output of an investigation is a persistent, inspectable state—not only an answer string.

## Recovery and reconstruction phase

The repository went through a non-trivial recovery/reconstruction period. Multiple temporary branches were used to preserve snapshots, reconstitute source, and verify that enhanced code could be reproduced safely.

Important historical branches include:

- `investigation-canvas-reconstructed-backup`;
- `recover-original-investigation-canvas`;
- `investigation-canvas-source`;
- `webmcp-visual-ci`;
- `webmcp-chrome-cft`.

The recovery work produced duplicated or differently-hashed commit histories in a few places. This is why branch divergence alone is not a reliable signal that production code is missing.

The current rule after recovery is simple: **`main` is authoritative**. Historical branches are retained only for archaeology/recovery context.

## Test suite expansion

The source suite grew to **93 unit/integration/contract tests**.

Coverage includes:

- pure analysis helpers;
- filters and search;
- CSV parsing and schema inference;
- store initialization and mutation;
- undo/redo;
- hypotheses and evidence links;
- saved views and branches;
- export/import;
- canvas state and geometry;
- findings and causal links;
- rich evidence presence;
- counterevidence;
- reasoning graph behavior;
- built-in scenario recoverability;
- WebMCP catalog size/uniqueness;
- schemas and annotations;
- agent-side mutations of shared state.

Tests intentionally verify that the seeded investigations contain recoverable causes, not merely that the UI renders.

## Reusable visual/browser harness

A dedicated Playwright harness was added under `ci/visual/`.

It provides:

- harness self-testing;
- multi-state Investigation Canvas automation;
- screenshot/diagnostic artifacts;
- a minimal native WebMCP fixture;
- a browser probe that can test `document.modelContext` and `registerTool` behavior in a real Chrome build.

This browser harness was initially developed on a dedicated branch and later incorporated into the production repository.

## Native Chrome 152 WebMCP verification

Because ordinary Playwright mocks are insufficient to prove browser capability, a dedicated Chrome for Testing 152 probe was introduced.

An early branch (`webmcp-chrome-cft`) only downloaded Chrome as an artifact. That experiment was superseded by the integrated `native-webmcp-chrome152` job in `.github/workflows/webmcp-visual-ci.yml`, which:

1. downloads Chrome for Testing 152;
2. serves a minimal WebMCP probe fixture;
3. launches the real browser;
4. probes native `document.modelContext` / `registerTool` capability;
5. uploads screenshots/report artifacts.

This is now part of the permanent visual CI rather than a standalone experiment.

## 48-tool all-invocation browser verification

A separate WebMCP Kit-style verifier was created at `recovery/webmcp-kit-browser-verify.py`.

The verifier:

- loads the local app in Chromium;
- registers the complete WebMCP catalog;
- invokes every tool against deterministic seeded state;
- records success/failure;
- checks visible UI effects for representative mutations.

Verified result at the final production baseline:

- **48 registered**;
- **48 invoked successfully**;
- visible effects confirmed for selection, filtering, hypotheses, and agent-created canvas views.

This was important because “tool is defined” is much weaker than “tool can actually execute in the browser against the real store.”

## Visual audit

A broader browser audit was run across desktop/tablet/mobile layouts and multiple application states.

The audit surfaced **nine real rendering/layout issues** despite the unit suite being green. The main categories were:

1. missing spatial-canvas borders;
2. scatter zero-span scaling;
3. timeline zero-span scaling;
4. mobile Investigation Signals layout;
5. narrow-screen chart controls;
6. evidence heading/search responsiveness;
7. narrow evidence/form layout;
8. map normalization/right-edge label overflow;
9. mobile stacked-canvas drag behavior mutating hidden desktop geometry.

After fixes, the expanded screenshot audit reported no remaining visual issues in the tested matrix.

## Visual-fix implementation

The production fixes included:

### Chart scaling

Scatter and timeline renderers now protect against zero numeric span so SVG coordinates remain finite.

### Spatial-canvas borders

The canvas CSS had used a nonexistent/wrong border variable. It was corrected to the actual theme line variable.

### Responsive layouts

Dedicated responsive classes replaced brittle inline layout assumptions for:

- Investigation Signals;
- chart headers/actions;
- hypothesis/evidence page headings;
- evidence search;
- evidence columns;
- two-column forms;
- toast sizing.

### Map evidence

Map normalization now derives extents from the actual numeric points rather than mixing them with artificial `0`/`1` bounds. Right-edge pins reverse label direction so labels remain inside the map.

### Mobile canvas behavior

On narrow screens, the spatial canvas becomes a stacked reading surface. Drag/resize binding now exits on mobile, preventing touch/pointer movement from writing hidden desktop geometry back into shared state.

## Permanent visual regression coverage

The temporary audit was not left as a one-off manual check. Important defects were folded into `tests/e2e.py` as permanent assertions.

The browser E2E now checks, among other things:

- desktop rendering and tool registration;
- human selection/filtering;
- agent-side WebMCP mutations;
- tab rendering;
- dataset switching;
- finite SVG/chart geometry;
- visible canvas borders;
- map-label containment;
- mobile overflow;
- responsive Investigation Signals layout.

The final E2E prints:

`E2E passed; registered tools=48; visual layout regression checks passed`

when successful.

## PR #6 — visual fixes merged

The visual-fix work was consolidated into PR #6: **Fix Investigation Canvas visual rendering and mobile layout**.

Before merge, the exact PR merge candidate passed:

- static diff validation;
- all 93 source tests;
- permanent browser E2E;
- WebMCP all-tool verification;
- reusable browser-harness self-test;
- multi-state visual/browser automation;
- native Chrome 152 WebMCP probing.

The PR was merged into `main` with production code only; temporary visual-audit/apply scaffolding was removed.

## PR CI bug discovered and fixed

The first full PR CI run failed before running the application tests.

Root cause:

- `actions/checkout` fetched a shallow PR merge ref;
- the workflow ran `git diff --check origin/${{ github.base_ref }}...HEAD`;
- `origin/main` did not exist in the shallow checkout.

This was an infrastructure bug, not an application failure.

The workflow was corrected to use `fetch-depth: 0`, after which static validation and the full browser suite ran successfully against the real PR merge ref.

This is preserved as a caution: a green or red CI label is not enough—inspect whether the intended tests actually executed.

## CI warning cleanup

After the production merge, the permanent workflows still emitted avoidable infrastructure warnings.

Two issues were cleaned up:

### Playwright executable discovery

The workflow previously launched the Playwright driver solely to read `p.chromium.executable_path`, then immediately closed it. On the GitHub runner this occasionally emitted a transient pending-task / `TargetClosedError` warning.

The workflow now discovers the installed Chrome binary directly under Playwright's cache and validates that it is executable.

### GitHub Actions runtime deprecations

The permanent workflows were moved from older action majors to the then-current Node-24-era releases:

- `actions/checkout@v7.0.1`;
- `actions/setup-node@v7.0.0`;
- `actions/upload-artifact@v7.0.1`.

This removed the Node 20 deprecation warnings from the workflow output.

## CI-only verification PR #7

Because the connector did not expose a direct workflow-dispatch action, a tiny CI-only branch/PR was used to exercise the modernized workflow definitions through the real pull-request path.

PR #7 changed only a harmless trigger file and was explicitly marked as “close without merge.”

Both permanent workflows passed with the modernized actions:

- 93/93 tests;
- permanent visual E2E;
- 48/48 WebMCP browser verification;
- browser harness self-test;
- multi-state visual automation;
- native Chrome 152 probe.

The previous Node-runtime and Playwright executable-probe warnings were gone.

PR #7 was then closed without merge so the trigger marker never entered `main`.

## Final verified baseline before handover docs

Production commit:

`4411049fc5b4773a98f40b50741e800c062d30ed`

At this baseline:

- application code is on `main`;
- PR #6 visual fixes are merged;
- temporary audit/apply scaffolding is absent from `main`;
- 93/93 source tests pass;
- desktop/mobile permanent browser E2E passes;
- 48/48 WebMCP tools register and execute;
- multi-state visual automation passes;
- native Chrome 152 WebMCP probing passes;
- permanent CI uses current Node-24-era action releases;
- the identified CI warnings are removed.

The handover/devlog commits after this point are documentation-only unless explicitly noted otherwise.

## Current product priorities

The implementation is now more heavily tested than most hackathon prototypes. The best return is no longer broad robustness work.

Highest-value next work:

1. tighten the <3-minute demo;
2. make the primary checkout scenario visually obvious within seconds;
3. emphasize shared attention, competing hypotheses, falsification, and inspectable reasoning;
4. polish onboarding and judge comprehension;
5. ensure public deployment/submission metadata exactly match the implementation;
6. add new features only if they materially strengthen the shared visual reasoning loop.

The product should resist drifting into a generic chatbot, generic dashboard, or generic MCP server. Its strongest differentiator is that human and agent manipulate the same visual investigation state.