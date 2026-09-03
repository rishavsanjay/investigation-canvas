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

Show the WebMCP tool catalog. Explain that the same site exposes 35 structured actions over its semantic model, with read/write hints and explicit untrusted-output hints for source evidence.

Close on the broader vision: investigation should be a shared visual workspace, not a chat transcript next to a dashboard.
