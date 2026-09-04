# Automatic Demo Mode

For a recording-ready 2–2.5 minute voiceover, use [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md).

## Exact URL

To launch the zero-click, fully automatic guided demonstration:

```
http://127.0.0.1:4173/?demo=1
```

For fast automated tests and continuous integration checks, an optional `demoSpeed` query parameter controls the playback speed multiplier without altering the underlying tool execution or data:

```
http://127.0.0.1:4173/?demo=1&demoSpeed=10
```

Normal URLs without `?demo=1` (such as `http://127.0.0.1:4173/`) do not load or execute demo scripts or automated actions.

## Disclosure Guidance

When publishing video recordings, screen captures, or walkthroughs of this demo:

1. **Automation Disclosure**: In the video narration or submission text, explain that this is an automated demo run. The interface distinguishes `AGENT` tool executions from the simulated `HUMAN CHALLENGE` without covering the product UI with a permanent disclosure tag.
2. **Synthetic Data Disclosure**: The dataset is deterministic synthetic incident data (`checkout-regression`) generated locally for reproducible WebMCP evaluation. It represents no real company, users, or live production environment.
3. **Real Tool Execution**: Disclose that no mock backend or fabricated analytical numbers are used during playback. The run performs 23 actions through the real `createWebMcpTools(store)` handlers (`describe_workspace`, `select_where`, `compare_selection_to_rest`, `search_evidence`, `update_hypothesis`, `attach_evidence_to_hypothesis`, `find_counterevidence`, `focus_evidence`, `create_finding`, `create_canvas_view`, `focus_canvas_view`, `get_selection`, `fork_hypothesis`, `add_causal_link`, and `get_activity_provenance`), and all statistical metrics in captions and findings are computed live from the active workspace state.
4. **Human Interaction Simulation**: Make clear that the human challenge step simulates a user dragging a selection over desktop cohort records in the shared visual canvas to demonstrate how agents consume shared visual attention via `get_selection` rather than relying solely on chat prompts.

During playback, a clearly labeled **Demo conversation** dock simulates the human/agent exchange and is wired around the real `createWebMcpTools(store).execute` handlers. It opens with the product promise and five outcome-oriented capability groups covering all 48 tools. The footer slows down and explains the current action as Goal, Action, and Result, exposes exact input/result JSON under collapsed technical details, and retains a collapsed audit list of all completed actions. The human challenge is deliberately highlighted as the moment the user redirects the agent with a shared visual selection. The run audits Provenance, then finishes on the competing hypotheses with a concise two-cause outcome summary instead of a dense activity log. A visible in-page simulated cursor moves between the affected controls and visualizations and pulses on interactions (it does not control the OS cursor). Demo state is isolated to the browser session, so running or replaying it does not overwrite the user's normal saved workspace. Native ChatGPT tool-call UI appears only when a real ChatGPT agent initiates the WebMCP calls.

---

# 3-minute demo outline

## 0:00–0:25 — The problem

Open the Checkout conversion case.

Explain that rich investigation interfaces expose charts, tables and graphs to humans, but agents normally see a difficult visual/DOM surface. Investigation Canvas exposes the semantic state through WebMCP while preserving a serious human visual workspace.

## 0:25–1:20 — Agent investigates

Prompt:

> Conversion dropped this week. Investigate it. Keep competing hypotheses and try to falsify the leading one.

Show the agent orienting with the workspace, then visibly selecting a suspicious segment. Point out that the same selection appears in the scatter plot, timeline, table, and the automatic “why this selection is different” panel.

Have it open the relevant release/support evidence and create/update a Safari/web-4.7.2 hypothesis while weakening or ruling out the payment-service hypothesis.

## 1:20–2:10 — Human challenges the agent

Manually select suspicious desktop points that do not fit the leading explanation and say:

> These don't fit your explanation. Investigate them separately.

The agent now receives the exact human selection through `get_selection`, compares it, and discovers the pricing experiment regression. Show two simultaneous hypotheses rather than a single chat answer.

## 2:10–2:40 — Auditability

Open Hypotheses and Evidence briefly. Show supporting vs. contradicting evidence and falsification questions.

Open Provenance and show that human and agent selections, filters, tool calls, evidence actions and hypothesis updates are preserved.

## 2:40–3:00 — Why WebMCP

Show the WebMCP tool catalog. Explain that the same site exposes 48 structured actions over its semantic model, with read/write hints and explicit untrusted-output hints for source evidence.

Close on the broader vision: investigation should be a shared visual workspace, not a chat transcript next to a dashboard.
