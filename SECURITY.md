# Security

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/OperatorNest/convex-models-dev/security/advisories/new) or [operatornest+security@gmail.com](mailto:operatornest+security@gmail.com). Include the version, operation, reproduction and impact. Keep exploit details private until maintainers coordinate disclosure. Only the latest published version receives fixes.

The component stores catalog data and sync settings, declares no environment variables and holds no credentials. Outbound requests are GETs to the configured HTTPS source and, on failure, `https://models.opencode.ai/api.json`. The configured source defaults to `https://models.dev/api.json`.

- Catalog responses are untrusted. Download, Unicode, row-size, usable-row minimum and removal guards limit accepted data. Malformed models preserve their stored rows; malformed providers abort before writes.
- Catalog writes require a live run lease and clear cached validators. A removal pass uses the pre-write catalog snapshot; deleting more than 20% requires `force`.
- Source URLs require HTTPS, omit credentials and fit in 2048 UTF-8 bytes.
- The host app authorizes component calls. Keep maintenance wrappers internal or require maintainer authorization. The example uses internal maintenance functions and authenticated public reads.
- Stored and returned sync errors contain a fixed code/message pair and optional HTTP status. Upstream bodies, headers and exception text are excluded.

Reports of guard bypasses, unintended request targets, credential leaks or catalog corruption are in scope. Include app authorization code when the reproduction depends on a wrapper.
