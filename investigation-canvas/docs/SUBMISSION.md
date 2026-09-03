# Submission draft

## Project description

Investigation Canvas is a WebMCP-native visual reasoning workspace for investigating complex data and evidence. Humans can brush charts, select records, inspect timelines, traverse relationships, open source documents, and maintain competing hypotheses. Browser agents receive semantic WebMCP tools over the exact same state and can select evidence, run comparisons, restructure visual views, open sources, create and revise hypotheses, attach supporting or contradicting evidence, branch investigations, and preserve an auditable provenance trail.

## Why WebMCP is essential

A traditional browser agent looking at a scatter plot, SVG graph, or large evidence table must recover application semantics from the rendered interface. Investigation Canvas already knows which records correspond to each visual mark and what the current filters, selection, graph entities, evidence documents and hypotheses mean. WebMCP lets the site expose these concepts directly to the browser agent.

This is not just faster clicking. It creates shared attention: when a human brushes a cluster, the agent can retrieve the exact selected records; when the agent selects a suspicious cohort or opens a document, the human sees that action immediately in the visual application.

## What people and agents can do together

A human can notice an anomaly visually, challenge a conclusion, or impose a new line of inquiry. The agent can search large state spaces, compare groups, rank discriminating features, inspect evidence, and maintain multiple explanations. Both manipulate the same persistent investigation artifact rather than exchanging disconnected messages.

## Implementation

The page registers a broad imperative WebMCP tool surface with `document.modelContext.registerTool`. Tools are backed by the same deterministic state store that drives the UI. Read-only operations use `readOnlyHint`; evidence-returning tools use `untrustedContentHint` because source material can contain untrusted external text. Mutating tools update filters, selections, focused evidence, hypotheses, annotations, saved views, branches and visual dimensions so their effects are visible to the user.

## Testing instructions

1. Open the live URL in a WebMCP-capable browser.
2. Keep the built-in **Checkout conversion regression** case selected.
3. Ask: “Conversion dropped this week. Investigate the cause. Maintain at least two competing hypotheses and try to falsify the leading one.”
4. Observe agent-driven selections and view changes in the main workspace.
5. Manually select a group of desktop anomalous points and ask: “These don't fit your explanation. Investigate them separately.”
6. Inspect Hypotheses, Evidence, and Provenance tabs.
