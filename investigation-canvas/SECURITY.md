# Security notes

Investigation Canvas is a client-side demonstration project. Imported datasets and evidence stay in the browser unless the hosting environment or browser agent explicitly transmits them elsewhere.

Evidence can contain untrusted third-party text. WebMCP tools that return source documents are annotated with `untrustedContentHint: true` and their descriptions tell agents to treat document contents as evidence rather than instructions.

No imported text is executed as HTML; user/source values are escaped before rendering.
