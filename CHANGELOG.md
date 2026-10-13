# @operatornest/convex-models-dev

## 0.3.0

### Minor Changes

- 48ed41b: - Breaking: rename `providerId` to `modelsDevProviderId`, `providerIds` to `modelsDevProviderIds`, `modelId` to `modelsDevModelId` and `canonicalModelId` to `modelsDevCanonicalModelId` in catalog documents and public query arguments; Convex row identities remain `_id` on documents and use entity-specific names in sync operations.
  - Breaking: minimum query limits become `minContextTokens` and `minOutputTokens`.
  - Breaking: numeric query filters and result limits must be finite and nonnegative; negative or non-finite values throw `MODELS_DEV_INVALID_ARGUMENT`.
  - Breaking: modality filters reject values other than `text`, `audio`, `image`, `video` and `pdf` instead of ignoring them.
  - Breaking: replace `sync.now` and its `force` flag with guarded `sync.run` and explicit `sync.runForced` operations.
  - Breaking: sync status replaces `lastError` with an ordered `errors` array; sync summaries also return `errors`, and skipped invocations use `reason`.
  - Breaking: use `MODELS_DEV_INVALID_ARGUMENT` (message "An argument is missing, malformed or out of bounds.") for invalid settings, `MODELS_DEV_INVALID_RESPONSE` for malformed catalogs, `MODELS_DEV_PROVIDER_ERROR` for HTTP failures `MODELS_DEV_NETWORK_ERROR` for a failed request or body read (message "The request to models.dev failed before a response arrived."), and `MODELS_DEV_SYNC_FAILED` for any other sync failure without a specific code.
  - Breaking: error guards require the fixed message for the code, validate optional provider diagnostics, require `retryable` for provider and network failures and reject it for every other code.
  - Breaking: cost estimation requires an explicit `mode` (`null` for base pricing) and `inputTokenScope` (`includesCache` or `excludesCache`).
  - Breaking: rename `usageFromAgent` to `extractUsage`, `providerCandidates` to `listProviderCandidates`, `PriceFields` to `CostFields` and `PriceTier` to `CostTier`.
  - Export sync, skip-reason and history-event unions.
  - Breaking: history timestamps and their indexes use `changedAt`.
  - Breaking: rename stored-read methods to `models.listCheapest`, `models.listEquivalents`, `models.listPriceChanges` and `sync.getStatus`.
  - Breaking: component entrypoints use `models.estimateCost` and `config.update`; example pagination accepts `paginationOpts`.
  - Breaking: list page sizes must be integers from 1 through 100; bounded pages expose continuation and pinned-interval split metadata.
  - Breaking: `models.listCheapest` returns `{ models, isComplete }`, merges provider cost indexes when providers are selected and scans at most 1927 priced rows, down from 4000.
  - Breaking: costs with unsafe rounded nano-USD terms or totals return `known: false`; invalid token counts throw `MODELS_DEV_INVALID_ARGUMENT`.
  - Breaking: upgrade the `convex-helpers` peer to `^0.1.128` and require Node.js 24 or newer.
  - Breaking: client methods discard undeclared fields; example maintenance functions are internal and public example queries require authentication.
  - Export `MODELS_DEV_ERROR_CODES` and document exported client methods and types in declarations.
  - Preserve stored rows for malformed catalog models and providers while enforcing download, Unicode, collection, indexed-string and row-size bounds.
  - Compare removals with the pre-write catalog and prevent guarded syncs from removing prices from more than 20% of stored priced models.
  - Clear cache validators before catalog writes and restore them only after a completed data sync.
  - Breaking: history cleanup moves to the internal `cleanup.run` mutation and its hourly `cleanup` cron, which runs whether or not `enabled` is set and whether or not syncs succeed; each run reads `retentionDays`, deletes at most 500 expired documents and schedules another run when its batch fills.
  - Select equivalent models by price before applying the result limit and return unknown pricing for an unpriced requested mode.
- f4b85bf: - Breaking: model limits move into `limit: { context, input?, output }`, copied verbatim from the catalog; the context-ordered indexes use the derived `contextTokens` field.
  - Breaking: sync status and sync summaries name the loaded catalog URL `sourceUrl` instead of `source`; error entries keep `source: "primary" | "fallback"`.
  - Breaking: `models.listCheapest` rejects an empty `modelsDevProviderIds` array and more than 64 distinct IDs with `MODELS_DEV_INVALID_ARGUMENT`, and deduplicates repeated IDs; omit the argument to select every provider.
  - Breaking: remove the unused internal `config.getEffective` query.
  - Export `KNOWN_MODEL_STATUSES` with `alpha`, `beta` and `deprecated`; stored statuses and the `models.list` status filter continue to accept other strings.
  - Breaking: `release_date` and `last_updated` must be calendar-valid `YYYY-MM` or `YYYY-MM-DD` strings; other values skip the model.
  - Reasoning budgets accept `min` of -1, require `max` to be nonnegative and reject `min` greater than `max`.
  - Store the upstream model `type` verbatim and add an optional `type` filter to `models.list` and `models.listCheapest`: a string selects that type, `null` selects models without a type, and omission filters nothing.
  - Partial runs record `partialReason` (`price_loss` or `removal`) and their counters; export the `PartialReason` type.
  - A provider's `modelCount` counts only its models that pass normalization.
  - An expired lease that no other run took over keeps accepting its run's writes and finish.
  - Breaking: catalog downloads above 8 MiB fail with `MODELS_DEV_CATALOG_TOO_LARGE`, keeping the measured peak action heap at or below 32 MiB. Catalog requests do not follow redirects: a 3xx response fails with `MODELS_DEV_INVALID_RESPONSE`, except that HTTP 304 in response to a conditional request returns `not_modified`. The body is decoded as UTF-8 while it streams, with no whole-catalog byte buffer; a body that is not well-formed UTF-8 fails with `MODELS_DEV_INVALID_RESPONSE`.
  - Breaking: normalized model rows above 4 KiB of serialized JSON are skipped; provider rows keep the 64 KiB limit.
  - Breaking: rename the `estimateCost` result field `priceSnapshotAt` to `modelUpdatedAt`; it is the time the component last wrote the stored model row, not an upstream date.
  - Breaking: `config.update` rejects a `sourceUrl` containing a query, fragment or lone surrogate, or exceeding 2048 UTF-8 bytes, with `MODELS_DEV_INVALID_ARGUMENT`; URLs must still use HTTPS and contain no credentials.
  - A failed sync records each source failure once; a failed sync whose lease was taken over returns `MODELS_DEV_LEASE_LOST` and leaves the new run's state. A failed sync starts the minimum interval, spacing unforced retries against a failing upstream.
  - Upgrade from 0.2.0: stored rows in `syncState`, `models`, `providers` and `priceChanges` fail schema validation on push. No migration is provided. Before upgrading, clear these four component tables, or remove and re-add the component; after deploying, run `sync.runForced`. Clearing `priceChanges` discards recorded history.
  - Breaking: remove the `removalSkipped` sync counter; a skipped removal is reported only by `partialReason: "removal"`.
  - Breaking: list queries ignore caller `maximumRowsRead` and `maximumBytesRead`; each page reads at most `numItems + 1` rows and targets 1 MiB of document bytes, including the document that reaches or exceeds that target.
  - Breaking: list cursors longer than 4096 characters or holding more values than the selected index’s declared field count plus 2 throw `MODELS_DEV_INVALID_ARGUMENT`.
  - Breaking: `ModelsDev.component` is private; client pagination forwards only `numItems`, `cursor` and `endCursor`.
  - Provider and network errors always carry `retryable`: catalog reads classify network failures, timeouts and HTTP 408, 429 or 5xx as true; every other HTTP failure is false. Invalid responses carry no `retryable`.
  - Strings containing well-formed surrogate pairs are accepted; lone surrogates are still rejected.
  - Document `sync.run`, `sync.runForced` and `config.update` in the README API table, and document the client context types.
  - Breaking: `providers.list` requires `{ paginationOpts }` and returns `{ page, isDone, continueCursor }` with optional split metadata, ordered by provider ID. Provider pages share the 1–100 item range, `numItems + 1` row bound and 1 MiB byte target of model pages; there is no 500-provider result cap.

## 0.2.0

### Minor Changes

- 8146e4b: The repository was re-created with a clean history; package code and API are unchanged from 0.1.1. The maintainer provider check is now `pnpm e2e` where provided; this repository has no maintainer provider script.

## 0.1.1

### Patch Changes

- Publish from GitHub Actions through npm trusted publishing, with signed npm provenance attestations. No API or behavior changes.

## 0.1.0

### Minor Changes

- Initial release. A Convex component that mirrors the models.dev catalog (about 8,400 models from 220+ providers as of October 2026) and prices token usage from it.
  - Hourly cron sync with conditional GET (ETag), a content-hash short circuit, per-row hashes, chunked lease-fenced writes, a size guard, a guarded removal pass, a fallback source and price-history retention.
  - Queries: `models.get`, `getByKey`, `resolve`, `list` (filtered, ordered, paginated), `search`, `cheapest`, `equivalents`, `priceHistory` and `estimateCost`; `providers.list` and `get`; `sync.status`, `sync.now`; `config.get` and `config.update`.
  - A typed `ModelsDev` client with grouped methods, an `aliases` option, `isModelsDevError`, and coded `MODELS_DEV_*` errors.
  - Pure `estimateCost` in integer nano-USD with context tiers, modes, cache, reasoning and audio rates, plus `usageFromAgent` and `resolveModel` helpers.
  - `register(t)` for `convex-test`, an example app and a real-runtime `pnpm smoke`.
