# 0002. No secrets, webhooks, env vars or test mode

## Context

Credentials belong in component env vars. Inbound provider events require signature verification,
provider side effects require explicit test-mode opt-in, and repeated creates need deduplication.
This component mirrors a public, unauthenticated catalog (`https://models.dev/api.json`). It
has no provider account, no credentials, no inbound HTTP and no side effects outside its own
tables.

## Decision

- No env vars are declared and `src/` never reads the environment.
- No webhooks and no `registerRoutes`. Updates are pulled by the component's own hourly cron.
- Test mode is not applicable. There is no live system to protect and no `testMode` option,
  helper, env var or row tag. Tests stub `fetch`, and `pnpm smoke` reads the public API only.
- Live-key refusal is not applicable (there are no keys).
- There is no `<PREFIX>_NOT_CONFIGURED` code: the component works with defaults and needs no
  configuration. `ModelsDevOptions` carries only `aliases`.
- Idempotency keys are not applicable: `sync.syncNow` is a reconciliation that is safe to repeat,
  and a lease prevents overlapping runs.

## Consequences

- The README has no Webhooks section and its Configure section lists settings, not env vars.
- `SECURITY.md` and `CONTRIBUTING.md` describe the real boundary: an untrusted upstream catalog
  and the sync guards.
- If a future version adds a keyed source, it must add the env declaration, `testMode` helper
  and `MODELS_DEV_NOT_CONFIGURED` at the same time.
