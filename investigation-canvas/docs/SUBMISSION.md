# Devpost submission draft

> Nothing in this file has been submitted to Devpost. Replace the two `TODO` URLs after deployment and video upload.

## Project name

Investigation Canvas

## Elevator pitch

Investigation Canvas turns messy data into a shared visual investigation where humans spot what matters and AI agents test it with auditable WebMCP tools.

## Short tagline

See the signal. Challenge the agent. Prove the cause.

## About the project

### Inspiration

Most AI data tools force people into one of two bad interfaces: a chat window that hides the underlying evidence, or a dashboard that an agent can only understand by scraping pixels and clicking DOM elements. Real investigations are more collaborative. A human notices an odd cluster, questions an assumption, or recognizes missing context; an agent can search hundreds of records, compare cohorts, inspect evidence, and keep several explanations alive at once.

We built Investigation Canvas around a simple idea: the human and the agent should work on the same investigation artifact, not exchange disconnected summaries.

### What it does

Investigation Canvas is a visual reasoning workspace for exploring datasets, evidence, relationships, hypotheses, findings, and causal explanations. Humans can filter and brush records, inspect linked charts and timelines, open source documents, traverse entity relationships, arrange evidence on a spatial canvas, and challenge the current theory.

An external WebMCP-capable agent can act on that exact same state through 48 semantic tools. It can query records, compare selected cohorts, rank discriminating features and correlations, find outliers, inspect trusted and untrusted evidence, create competing hypotheses, search for counterevidence, attach supporting or contradicting sources, record findings, build causal links, arrange canvas views, save an analysis view, branch the investigation, and review the provenance trail. Every action remains visible and auditable in the workspace.

The app includes three deterministic example investigations:

- a checkout conversion regression with two independent causes;
- an ML model quality regression involving preprocessing and optimizer behavior;
- a suspicious transaction network with explicit evidence-trust boundaries.

The **Do example** flow lets a judge choose a scenario, see its mission and starter questions, load a safe isolated workspace, copy an agent prompt, and then continue the investigation with ChatGPT's in-app browser or Chrome with WebMCP enabled. It does not fake a conversation or impersonate an external agent.

### Why WebMCP

A scatter plot may be obvious to a person but opaque to an agent. The application already knows which records every mark represents, which cohort is selected, how evidence relates to a hypothesis, and which actions changed the investigation. WebMCP exposes those semantics directly through `document.modelContext.registerTool(...)` instead of forcing an agent to reverse-engineer the rendered page.

That creates a better experience than ordinary browser automation: the human can select an unexpected cohort and the agent can immediately analyze those exact records; the agent can focus evidence or create a finding and the human can immediately see, inspect, rearrange, or reject it. Shared attention becomes part of the product.

### How we built it

The project is a dependency-light static web application written in JavaScript, HTML, and CSS. A deterministic state store drives every visual view and also backs the WebMCP tool implementations, so human and agent actions cannot drift into separate copies of the investigation.

The site registers its tools with the imperative WebMCP API. Read-only operations are annotated accordingly, while tools returning third-party source text declare untrusted content. Mutating tools use the same store operations as the visible interface, which makes their effects observable in selections, filters, hypotheses, evidence, canvas artifacts, branches, and provenance.

We also added CSV and JSON import, schema inference, complete Investigation Canvas JSON export/import, browser-local persistence, undo/redo, saved views, and restorable branches. The example workflow isolates its session and restores the user's original workspace on exit.

### Challenges we faced

The hardest problem was not adding more tools; it was making agent activity understandable. Early demo concepts moved too quickly, crowded the screen, and blurred the line between a real external agent and a scripted simulation. We removed that approach and redesigned the experience around an explicit handoff: choose a real dataset, understand the mission, copy a prompt, connect through WebMCP, and watch durable state changes appear in the same workspace.

Another challenge was preserving spatial context. Selecting a point or focusing evidence must not unexpectedly reset the canvas or camera. We separated data-state changes from view-state changes so human exploration remains stable while an agent works.

Finally, evidence is not automatically truth. The fraud scenario includes untrusted external material, and the tool metadata and UI make that boundary visible rather than quietly treating every document as authoritative.

### What we learned

We learned that WebMCP is most valuable when a website already contains rich domain semantics. Exposing those semantics produces a more reliable agent interface, but the bigger benefit is collaboration: agent actions become legible product actions instead of invisible chat reasoning.

We also learned that a useful investigation system should make disagreement easy. Competing hypotheses, contradicting evidence, falsification questions, human-selected counterexamples, and provenance are not secondary features; they are what keep an agent's fast analysis accountable.

### What's next

Next we would add streaming API connectors, larger dataset processing through worker or server-side adapters, collaborative multi-user investigations, and exportable investigation reports. The core interaction would remain the same: humans steer attention and judgment while agents perform structured analysis through visible, auditable tools.

## Video demo link

TODO: Upload the revised sub-3-minute demo to YouTube as Public or Unlisted and paste its URL here.

## Try it out links

- Live application: TODO — paste the deployed HTTPS URL
- Recommended checkout example: TODO — paste `<LIVE_URL>/?example=checkout`
- Public source code: https://github.com/rishavsanjay/investigation-canvas

## Image gallery plan

Export each image as a 3:2 PNG or JPG under 5 MB.

1. **Shared investigation workspace** — linked scatter plot, timeline, evidence, hypotheses, and spatial canvas in one frame.
2. **Choose an example** — the three scenario cards with missions, dataset sizes, and starter questions.
3. **Human + agent handoff** — WebMCP-ready status, concise prompt, and the live investigation checklist.
4. **Agent actions made visible** — selected cohort, focused evidence, competing hypotheses, and a created finding.
5. **Auditable conclusion** — causal links and provenance showing how evidence and inference led to the result.

## Recommended demo prompt

> Investigate why checkout conversion dropped. First orient on the dataset and establish baseline metrics. Isolate and compare anomalous cohorts, rank discriminating features and correlations, and inspect relevant evidence with its trust metadata. Maintain at least two competing hypotheses, attach supporting and contradicting evidence, and actively search for counterevidence before concluding. Record durable findings and causal links, arrange the key evidence on the canvas, save an analysis view, create an investigation branch, and finish by reviewing provenance while clearly separating verified evidence from inference.
