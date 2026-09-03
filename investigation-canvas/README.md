# Investigation Canvas

A visual investigation workspace where humans and browser agents reason over the same evidence and state.

## What is implemented

- Linked scatter plot, timeline, evidence table, and relationship graph
- Shared human/agent selection state and selection-vs-rest discrimination
- Automatic correlations, categorical concentration, and outlier leads
- Mixed evidence: documents, logs, image captures, and map-style geospatial evidence
- First-class hypotheses with confidence, supporting/contradicting evidence, and explicit falsification tests
- Counterevidence discovery and hypothesis forking
- Freeform spatial Canvas with draggable views, links, zoom, mobile stacked fallback, and agent-created views
- Human + agent provenance trail
- Findings and annotations
- Saved analysis state primitives, investigation branches, undo/redo, and local persistence
- CSV/JSON import and investigation export
- Three deterministic built-in scenarios: checkout regression, ML quality regression, and suspicious transaction network
- 48 semantic WebMCP tools using `document.modelContext.registerTool(...)`
- `readOnlyHint` and `untrustedContentHint` annotations
- No runtime dependencies or build step

## Run

```bash
python3 -m http.server 4173 --directory investigation-canvas
```

Then open `http://localhost:4173`.

For Chrome testing, WebMCP currently needs the WebMCP feature enabled, e.g. Chrome for Testing with `--enable-features=WebMCP`.

## Tests

```bash
cd investigation-canvas
npm test
```

The repository-level GitHub Actions visual harness additionally drives the app with Playwright, captures multiple investigation states and mobile/desktop screenshots, checks rendering overflow/collisions, audits the WebMCP registration surface, and runs these source-level contract tests on every app PR.
