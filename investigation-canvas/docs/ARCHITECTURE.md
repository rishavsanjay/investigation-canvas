# Architecture

## Design principle

The UI and WebMCP tools are two interfaces over one deterministic investigation store.

```text
Human UI ───────┐
                │
                ▼
        InvestigationStore
                ▲
                │
WebMCP tools ───┘

        │ records / evidence / graph
        │ filters / selection / dimensions
        │ hypotheses / annotations
        │ saved views / branches / provenance
        ▼
    linked renderers
 scatter · timeline · table · graph · evidence · hypotheses
```

The agent never needs to infer what an SVG circle means. It receives record IDs and structured values. Conversely, when the agent selects records or focuses evidence, the human sees that action through the normal UI.

## Files

- `src/sampleData.js`: deterministic realistic demo investigations.
- `src/core.js`: pure analysis, filtering, CSV parsing, schema inference, comparisons, outliers, correlations.
- `src/store.js`: state, persistence, history, hypotheses, evidence attachment, views, branches, export/import.
- `src/webmcp.js`: WebMCP tool definitions and registration.
- `src/app.js`: rendering and user interaction.
- `styles.css`: responsive visual system.

## Rendering choices

The project intentionally avoids a large UI/chart dependency. Scatter, timeline, and graph views use small deterministic SVG renderers; tables and evidence are plain DOM. This reduces dependency and layout failure risk during judging and keeps the semantic mapping between visual marks and records obvious.

The application re-renders from state rather than storing separate chart-local state. This makes human and agent mutations converge on one source of truth.

## Shared selection

`state.selection` is an array of record IDs and is the core collaboration primitive. Selection can be created by:

- clicking a chart point
- rectangular brushing
- table clicks
- the WebMCP `set_selection` tool
- the WebMCP `select_where` tool

All linked views read that same array. The automatic comparison strip computes discriminating features between selected records and the rest of the currently visible records.

## Trust boundaries

Evidence documents have a `trust` field. WebMCP tools returning evidence are marked with `untrustedContentHint: true`, because external/source text should be treated as evidence rather than instructions.

The built-in fraud case includes an explicitly unverified external allegation to demonstrate that the agent should corroborate rather than blindly trust source text.
