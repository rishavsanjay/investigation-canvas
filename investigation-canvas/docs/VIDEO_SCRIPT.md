# Demo video script

Target runtime: **2:15–2:25**. The automatic demo itself runs for roughly two minutes at normal speed, leaving a few seconds for the opening and closing.

## Recording setup

- Record at 1280×720 or 1920×1080 with browser zoom at 100%.
- Open the deployed equivalent of `/?demo=1`; do not use `demoSpeed`.
- Start recording before loading the URL. The demo runs automatically—no clicks are required.
- Read naturally at roughly 130 words per minute. Do not narrate every tool call.
- Keep the “Demo conversation” dock and the changing workspace visible throughout.

## Timed narration

### 0:00–0:15 — The problem

> Investigation Canvas is a shared visual workspace for humans and browser agents investigating the same evidence. Charts are intuitive to people, but an agent should not have to reverse-engineer a scatter plot from pixels. WebMCP exposes the structured records, selections, evidence, hypotheses, and findings already understood by the application.

On screen: the opening promise and five investigation outcomes appear.

### 0:15–0:30 — What is real

> This recording uses a simulated human-and-agent conversation to keep the demo deterministic. Every displayed agent action still executes a real WebMCP tool handler against live application state. The dataset is synthetic and reproducible; none of the analytical results are pre-rendered.

On screen: the human asks why checkout conversion dropped, and the first tool begins.

### 0:30–0:58 — Shared investigation

> The agent first inspects the workspace, then selects mobile Safari 20.2 traffic on release web-4.7.2. That exact selection appears across the linked visualizations. Comparing it with the baseline reveals a 2.99 percent conversion drop and a 395 millisecond latency increase.

On screen: the selected cohort and comparison results become visible.

### 0:58–1:24 — Evidence and self-correction

> Instead of jumping directly to an answer, the agent searches release notes and support evidence, strengthens the client-regression hypothesis, and weakens the payment hypothesis using a healthy payment-system report. It also calls the counterevidence tool to try to falsify its leading explanation before recording a finding.

On screen: hypotheses, evidence attachments, counterevidence, and the first canvas finding appear.

### 1:24–1:47 — The human changes the investigation

> Here is the important WebMCP moment. The human notices desktop points that the Safari explanation cannot explain and selects them directly in the chart. The agent reads that exact shared selection—not a screenshot description or a manually copied list—and investigates it as a new cohort.

On screen: the gold human-challenge state appears and 56 desktop records are selected.

### 1:47–2:10 — A second cause

> The selected desktop records reveal an independent pricing-experiment regression. The agent forks a competing hypothesis, attaches the experiment specification, records a second finding, and preserves the causal link. The human did not merely approve an answer; their visual judgment redirected the agent and improved the result.

On screen: the pricing hypothesis and second finding are created.

### 2:10–2:25 — Why WebMCP

> The final workspace shows two evidence-backed causes, the human contribution, and an auditable trail of 23 real WebMCP actions. This is the value: people supply visual judgment, agents supply structured analysis, and both work in one inspectable investigation instead of passing disconnected chat messages back and forth.

Hold the final frame for two seconds, then stop recording.

## Final recording checklist

- The video is public or unlisted on YouTube and plays without authentication.
- Runtime is below three minutes and audio is clearly understandable.
- The opening discloses the simulated conversation, synthetic dataset, and real WebMCP execution.
- The human challenge is visible long enough to understand.
- The final frame visibly shows both causes, the 56-record human redirect, and 23 WebMCP actions.
- The video description links the live application and public repository.
