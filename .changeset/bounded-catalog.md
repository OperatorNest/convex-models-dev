---
"@operatornest/convex-models-dev": minor
---

Harden catalog synchronization, query bounds and cost estimation.

Breaking changes:

- Sync failures return `error: { code, message, providerStatus? }` instead of a `reason` string. `sync.status().errors` records source diagnostics. Update error handling; `reason` now describes only skipped runs.
- Error messages are fixed per code. `retryable` is removed; the error guard rejects undeclared fields and malformed HTTP status values. Handle the new invalid-argument, fetch, catalog-size, write and lease error codes.
- List page sizes must be integers from 1 through 100. Each call reads at most `numItems + 1` rows and targets at most 1 MiB; filters can return shorter pages. Honor `pageStatus` and `splitCursor` for pinned reactive pages. Malformed cursors, nonfinite or negative query bounds and unsupported modalities now fail with `MODELS_DEV_INVALID_ARGUMENT`.
- Upgrade the `convex-helpers` peer to `^0.1.127` for filtered stream pagination.
- Catalog strings, collections, rows and downloads now have fixed size bounds. Malformed pricing, noncanonical dates, invalid reasoning budgets and invalid Unicode are skipped; malformed providers and their models are skipped with stored rows preserved. Source URLs exceeding 2048 UTF-8 bytes are rejected.
- Cost estimates return `known: false` for unsafe rounded nano-USD terms or totals. Handle unknown estimates instead of storing nonfinite or imprecise costs.
- Indexes now list every field in order with `_and_`. Model documents require `costOrder`; the canonical index includes it. Recreate pre-0.3.0 component data with the new schema and resync; no stored-data migration is supplied.
- Client methods discard undeclared argument fields, including pagination and usage fields. Only declared options reach the component.
- Example maintenance functions moved to `internal.example`; public example queries require authentication. Update example callers and configure app authentication.
- Consumers require Node.js 24 or newer.

Removal guards compare against the pre-write catalog, interrupted writes invalidate old cache validators, successful source changes clear absent ETags, and retention mutations reread settings before each batch. Equivalent-model limits now select the cheapest providers first.

- Every supplied token count must be a nonnegative safe integer; invalid usage throws `MODELS_DEV_INVALID_ARGUMENT` from the estimator and estimate query.
- Requested modes without pricing return `known: false` instead of base-price estimates.
- Indexed strings are capped at 1 KiB of UTF-8; oversized model rows are skipped with stored rows preserved.
- Catalog downloads stop above 16 MiB and accumulate chunks in one buffer.
- `models.cheapest` returns `{ models, isComplete }` and merges provider cost indexes when providers are selected.
- Unforced syncs that would remove pricing from more than 20% of stored priced models finish as `partial` without catalog writes.
- Sync status replaces `lastError` with ordered `errors` for failed primary and fallback attempts, including successful fallback runs.
- Malformed providers and their models are skipped with stored rows preserved; usable-provider minimums still apply.
