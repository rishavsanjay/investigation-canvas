# Investigation Canvas

**A visual reasoning workspace where humans and browser agents investigate the same evidence together.**

![Investigation Canvas preview](assets/preview.png)

Investigation Canvas is a static, open-source WebMCP application for exploratory investigation. Humans work through linked visual views—scatter plots, timelines, tables, relationship graphs, evidence documents, hypotheses, and provenance—while a WebMCP-capable agent receives structured access to the exact same state and can manipulate it visibly.

Instead of putting an AI chat box next to a dashboard, the application turns **selection, filters, hypotheses, evidence, views, and branches into shared state**. A human can brush a suspicious cluster and ask “why are these different?”; an agent can compare the selection, focus evidence, create competing hypotheses, attach supporting or contradicting sources, and change the visual view so the human can audit the work.

## Why this is a strong WebMCP use case

Rich visual investigation interfaces are excellent for humans but poor interfaces for agents. A browser agent looking at an SVG scatter plot or relationship graph normally has to infer semantics from pixels or DOM structure. Investigation Canvas already knows the semantic objects behind those visuals: records, selected IDs, dimensions, filters, graph entities, evidence sources, and hypotheses.

WebMCP lets the page expose that semantic model directly with `document.modelContext.registerTool(...)`. Agent actions then update the exact same application state the human is viewing.

The project uses the current imperative WebMCP API and tool annotations, including `readOnlyHint` and `untrustedContentHint` for source evidence that may contain third-party text.

## Main features

- Linked scatter plot with click selection and rectangular brushing
- Linked timeline with anomaly/severity markers
- Evidence table with synchronized selection
- Relationship graph with focusable entities and labeled edges
- Automatic “selection vs. rest” feature discrimination
- Mixed internal/untrusted evidence document library
- First-class competing hypotheses with confidence and status
- Supporting vs. contradicting evidence ledger
- Explicit falsification questions per hypothesis
- Workspace annotations
- Human + agent provenance/activity trail
- Saved analysis views
- Restorable investigation branches
- Undo/redo state history
- Persistent browser-local workspace state
- CSV and JSON dataset import with schema inference
- Full Investigation Canvas JSON export/import
- Three deterministic built-in investigations:
  - checkout conversion regression
  - ML model quality regression
  - suspicious transaction network
- Responsive layout for smaller screens
- No runtime dependencies and no build step
- 48 WebMCP tools spanning reading, analysis, shared attention, evidence, hypotheses, graph navigation, view control, branching, and provenance

## WebMCP tool surface

The agent can use tools such as:

- `describe_workspace`
- `list_records`, `get_record`, `query_records`
- `get_selection`, `set_selection`, `select_where`, `clear_selection`
- `summarize_records`, `compare_selection_to_rest`, `compare_queries`
- `rank_discriminating_features`, `rank_correlations`, `find_outliers`
- `add_filter`, `remove_filter`, `clear_filters`, `set_record_search`
- `configure_view`, `focus_record`
- `search_evidence`, `get_evidence`, `focus_evidence`
- `get_relationship_graph`, `focus_graph_node`
- `list_hypotheses`, `create_hypothesis`, `update_hypothesis`
- `attach_evidence_to_hypothesis`
- `annotate_workspace`
- `save_analysis_view`, `restore_analysis_view`
- `branch_investigation`, `restore_investigation_branch`
- `get_activity_provenance`

Read-only tools are marked with `readOnlyHint: true`. Tools that return source evidence whose text may be third-party/untrusted use `untrustedContentHint: true`.

## Run locally

No package installation is required.

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

For WebMCP tool exposure, use a WebMCP-capable secure browser environment (for example the supported ChatGPT browser, or a compatible Chrome configuration). The rest of the application still works in ordinary browsers.

## Suggested demo

Open **Checkout conversion regression** and ask the browser agent:

> Conversion dropped this week. Investigate the cause. Maintain at least two competing hypotheses, show me the evidence visually, and try to falsify your leading explanation before concluding.

A good trajectory is:

1. Agent calls `describe_workspace`.
2. It analyzes conversion and error-rate relationships.
3. It uses `select_where` for affected mobile/Safari segments.
4. The selection appears simultaneously in the scatter plot, timeline, table, and automatic comparison strip.
5. It calls `search_evidence` / `focus_evidence` to open relevant release/support evidence.
6. It creates or updates multiple hypotheses and attaches supporting/contradicting evidence.
7. The human challenges the explanation by selecting anomalous desktop points.
8. The agent compares that selection and discovers the independent pricing experiment regression.
9. Provenance shows the complete human + agent investigation trail.

This demonstrates shared attention and collaborative reasoning rather than simple browser automation.

## Testing

```bash
npm test
```

The repository currently contains 50 unit/integration tests covering statistical analysis, filters, imports, store history, branches, hypotheses/evidence, export/import, WebMCP tool metadata, and agent-side state mutations.

A Playwright end-to-end smoke test is included in `tests/e2e.py`. Some sandboxed CI/runtime environments block all Chromium navigation by administrator policy; the script is intended for a normal local or CI browser environment.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Hackathon submission notes

See [docs/SUBMISSION.md](docs/SUBMISSION.md) and [docs/DEMO.md](docs/DEMO.md).

## License

MIT.


## Post-baseline investigation canvas

The original 2026-09-02 baseline is preserved byte-for-byte in git history. A separate enhancement commit adds the features developed afterward:

- freeform spatial canvas with movable/resizable linked views, pan/zoom, grid and true focused-view layouts
- agent-created summary/analysis views that remain visible as investigation artifacts
- image-style captures, geospatial evidence, and log-stream evidence in every built-in scenario
- first-class hypothesis forks and explicit counterevidence discovery
- persistent findings and causal links rendered as a reasoning graph
- 13 additional WebMCP tools for canvas manipulation, rich evidence, findings, causal reasoning, forks, and counterevidence
- expanded regression tests covering the enhanced state model and WebMCP contract
