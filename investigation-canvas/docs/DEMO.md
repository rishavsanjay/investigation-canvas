# Interactive example workflow

Investigation Canvas uses a real, opt-in example workflow. It does not simulate a cursor, fake a conversation, or invoke its own WebMCP tools while pretending to be an external agent.

## Judge flow

1. Open the normal workspace and click **Do example**.
2. Choose one of three deterministic investigations: checkout regression, model regression, or suspicious transactions.
3. Review the mission, dataset shape, starter questions, and the division of work between human and agent.
4. Load the isolated example workspace.
5. Copy the concise scenario prompt or expand the comprehensive prompt.
6. With the page open in ChatGPT's in-app browser, paste the prompt into the surrounding conversation. Alternatively, use Chrome with WebMCP enabled and a compatible agent.
7. Watch selections, evidence, hypotheses, findings, canvas artifacts, and provenance update in the shared workspace as the external agent uses the registered WebMCP tools.
8. Challenge the agent by selecting an exception or contradictory cohort, then ask it to investigate that selection.
9. Click **Exit example** to restore the original workspace.

## Direct example URLs

- `?example=checkout`
- `?example=model`
- `?example=fraud`

Legacy `?demo=1` and `?walkthrough=1` URLs open the checkout example but no longer start an automated sequence.

## Recommended prompt

> Investigate why checkout conversion dropped. First orient on the dataset and establish baseline metrics. Isolate and compare anomalous cohorts, rank discriminating features and correlations, and inspect relevant evidence with its trust metadata. Maintain at least two competing hypotheses, attach supporting and contradicting evidence, and actively search for counterevidence before concluding. Record durable findings and causal links, arrange the key evidence on the canvas, save an analysis view, create an investigation branch, and finish by reviewing provenance while clearly separating verified evidence from inference.

## State safety

The example captures the current workspace, uses isolated session storage, and restores the previous in-memory and persisted workspace on exit. Copying a prompt only writes to the clipboard; the page never claims to send it to ChatGPT.
