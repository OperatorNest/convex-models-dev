# Security

Report suspected vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/OperatorNest/convex-models-dev/security/advisories/new). If you cannot use GitHub, email [operatornest+security@gmail.com](mailto:operatornest+security@gmail.com). Include the affected package version or revision, the operation involved, a minimal reproduction and the impact you see.

Do not publish exploit details in an issue or pull request before maintainers have assessed the report. Maintainers will coordinate a response and any disclosure with the reporter.

## What this component does and does not hold

`@operatornest/convex-models-dev` downloads a public catalog from `https://models.dev/api.json` (with `https://models.opencode.ai/api.json` as a fallback) and stores it in component tables. It has no API keys, no tokens, no webhooks and no environment variables, and it stores no personal data. Its only outbound request is a `GET` of the configured source URL.

## Where problems are likely

These are the areas worth a report:

- **A hostile or broken upstream catalog.** The payload is untrusted. The sync validates every row, skips malformed models without deleting stored rows, aborts when the payload is smaller than `minProviders` or `minModels`, and skips a removal pass that would delete more than 20% of rows unless a caller passes `force`. Reports of a payload that gets past these guards, exhausts memory or time in the sync action, or corrupts stored rows are in scope.
- **The source URL.** `config.update` accepts only `https` URLs without embedded credentials. A way to point the sync at a non-https, credentialed or otherwise unintended target is in scope.
- **Caller authorization.** The component does not authenticate callers. `config.update` and `sync.now` are public component functions, and the host app must guard the functions that call them. A report that depends on an app leaving them open is not a component vulnerability, but unclear documentation about it is a bug.
- **Stored error text.** `syncState.lastError` holds the host and HTTP status of a failure, never headers or bodies. A leak of other data there is in scope.

## Supported versions

Only the latest published version receives fixes.
