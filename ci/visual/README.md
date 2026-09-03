# Investigation Canvas visual CI

This harness uses Playwright to capture deterministic screenshots and browser diagnostics for Investigation Canvas.

The self-test job validates the screenshot/artifact pipeline at desktop, laptop, 390px mobile, and 360px mobile widths. When an `investigation-canvas/` directory is present in the checkout, the app job additionally serves it on localhost and captures multiple investigation states while checking horizontal overflow, mobile header collisions, failed resources, fatal console/page errors, and WebMCP tool registration metadata.

A separate Chrome for Testing 152 job probes the real `document.modelContext.registerTool` implementation on localhost, both with the default feature set and with `--enable-features=WebMCP`, and uploads screenshots plus a machine-readable capability report.

App screenshots are intentionally state-oriented rather than pixel-baselined at first: initial workspace, selected record, hypotheses, evidence, provenance, spatial canvas when exposed, scenario switching, and narrow mobile views. Stable baseline comparison can be enabled once the final UI is frozen.
