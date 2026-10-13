# @operatornest/convex-models-dev

[![Release](https://github.com/OperatorNest/convex-models-dev/actions/workflows/release.yml/badge.svg)](https://github.com/OperatorNest/convex-models-dev/actions/workflows/release.yml)
[![npm](https://img.shields.io/npm/v/@operatornest/convex-models-dev)](https://www.npmjs.com/package/@operatornest/convex-models-dev)

Mirror the [models.dev](https://models.dev) model catalog into Convex tables. Query model capabilities, limits and prices; estimate token costs in integer nano-USD. The component uses Convex's default runtime, has no runtime dependencies and requires no secrets.

## Install

```sh
pnpm add @operatornest/convex-models-dev convex convex-helpers@^0.1.128
```

Node.js 24 or newer, `convex ^1.46.0` and `convex-helpers ^0.1.128` are required.

In `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import modelsDev from "@operatornest/convex-models-dev/convex.config.js";

const app = defineApp();
app.use(modelsDev);
export default app;
```

## Configure

There are no component environment variables or provider credentials. Settings live in component tables.

| Variable | Required | Default | Valid values                                     |
| -------- | -------- | ------- | ------------------------------------------------ |
| None     | No       | None    | No component environment variables are declared. |

## Quick start

In your app's Convex functions:

```ts
import { ModelsDev, syncSummaryValidator } from "@operatornest/convex-models-dev";
import { components } from "./_generated/api";
import { internalAction } from "./_generated/server";

const modelsDev = new ModelsDev(components.modelsDev);

export const syncNow = internalAction({
  args: {},
  returns: syncSummaryValidator,
  handler: (ctx) => modelsDev.sync.run(ctx),
});
```

The component does not authenticate callers. Keep maintenance wrappers internal or require maintainer authorization before calling `sync.run` or `config.update`. The [example app](https://github.com/OperatorNest/convex-models-dev/blob/main/example/convex/example.ts) uses internal maintenance functions and requires authentication for public queries. Configure your app's authentication provider before using those queries.

Before the first sync, catalog queries return empty results and `sync.getStatus().state` is `never_synced`. The component owns two hourly crons: `sync models.dev catalog` and `cleanup`.

## Concepts

Catalog terms follow the [models.dev schema](https://github.com/anomalyco/models.dev/blob/dev/packages/core/src/schema.ts).

| Term                                                                                                                         | Meaning                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models`                                                                                                                     | Stored models.dev model offerings, identified by catalog provider and model IDs.                                                                                                                                                                                                                                                                                                              |
| `providers`                                                                                                                  | Stored models.dev services offering catalog models.                                                                                                                                                                                                                                                                                                                                           |
| `sync`                                                                                                                       | Catalog download and lease-fenced synchronization operations.                                                                                                                                                                                                                                                                                                                                 |
| `config`                                                                                                                     | Table-backed synchronization settings.                                                                                                                                                                                                                                                                                                                                                        |
| `_id`, `_creationTime`                                                                                                       | Convex document identity and creation timestamp in milliseconds since the Unix epoch.                                                                                                                                                                                                                                                                                                         |
| `modelsDevProviderId`, `modelsDevProviderIds`                                                                                | models.dev provider identifiers, individually or as a selection.                                                                                                                                                                                                                                                                                                                              |
| `modelsDevModelId`, `modelsDevCanonicalModelId`                                                                              | models.dev offering identifier and optional canonical lab/model identifier.                                                                                                                                                                                                                                                                                                                   |
| `key`, `provider`, `model`, `aliases`                                                                                        | Provider-qualified model key, AI SDK provider name, model name and provider-name mappings used for resolution. The resolver's `provider` is an AI SDK name mapped to a `modelsDevProviderId`; it is neither the stored catalog provider nor `providerOverride`.                                                                                                                               |
| `name`, `family`, `description`, `knowledge`                                                                                 | Catalog display name, model family, description and knowledge cutoff date.                                                                                                                                                                                                                                                                                                                    |
| `attachment`, `reasoning`, `toolCall`, `structuredOutput`, `temperature`, `openWeights`                                      | Catalog capability flags converted from source names to camelCase.                                                                                                                                                                                                                                                                                                                            |
| `status`                                                                                                                     | Catalog model status stored verbatim. `KNOWN_MODEL_STATUSES` lists the documented values: `alpha` and `beta` mark prerelease offerings and `deprecated` marks retired offerings. Any other upstream string is stored unchanged; omission means no catalog status. Synchronization copies source status changes without a local transition rule.                                               |
| `reasoningOptions`                                                                                                           | Catalog reasoning controls: `toggle`, `effort` with allowed `values`, or `budget_tokens` with `min` and `max`.                                                                                                                                                                                                                                                                                |
| `interleaved`, `field`                                                                                                       | Whether reasoning is interleaved, or the response field carrying reasoning.                                                                                                                                                                                                                                                                                                                   |
| `limit`, `context`, `input`, `output`                                                                                        | Catalog token limits object: context window, optional input limit and output limit, in tokens.                                                                                                                                                                                                                                                                                                |
| `contextTokens`                                                                                                              | Copy of `limit.context` stored as a top-level field to back the context-ordered indexes.                                                                                                                                                                                                                                                                                                      |
| `type`                                                                                                                       | Catalog model type stored verbatim, such as `embedding` or `reranking`; omission marks a language model. As a filter, a string selects that type and `null` selects models without a type.                                                                                                                                                                                                    |
| `minContextTokens`, `minOutputTokens`                                                                                        | Minimum context window and output limit for a query.                                                                                                                                                                                                                                                                                                                                          |
| `inputModalities`, `outputModalities`, `inputMask`, `outputMask`                                                             | Selected or encoded `text`, `audio`, `image`, `video` and `pdf` modalities.                                                                                                                                                                                                                                                                                                                   |
| `releaseDate`, `lastUpdated`                                                                                                 | Catalog release and update dates.                                                                                                                                                                                                                                                                                                                                                             |
| `costInput`, `costOutput`, `costCacheRead`, `costCacheWrite`, `costReasoning`, `costInputAudio`, `costOutputAudio`           | Catalog USD prices per million tokens.                                                                                                                                                                                                                                                                                                                                                        |
| `hasCost`, `costBlended`, `costOrder`, `maxCostInput`                                                                        | Availability of base pricing, weighted input/output price, its negation for ordering, and an input-price ceiling in USD per million tokens.                                                                                                                                                                                                                                                   |
| `tiers`, `size`                                                                                                              | Context pricing tiers and their token thresholds.                                                                                                                                                                                                                                                                                                                                             |
| `modes`, `mode`                                                                                                              | Catalog pricing modes and the selected pricing mode; `null` selects base pricing.                                                                                                                                                                                                                                                                                                             |
| `npm`, `api`, `doc`, `env`, `shape`, `providerOverride`                                                                      | Catalog provider package, endpoint, documentation, credential-variable names and response shape. A catalog provider is the stored `providers` row named by a model's `modelsDevProviderId`; `providerOverride` is the model's upstream `provider` object, which overrides that catalog provider's `npm`, `api` and `shape` for that model only. This component reads no provider credentials. |
| `modelCount`, `providerCount`                                                                                                | Counts of usable models and providers; a provider row counts only its models that pass normalization. Sync counters count the loaded catalog, so stored rows can outnumber them after a `partial` run.                                                                                                                                                                                        |
| `searchText`, `contentHash`, `firstSeenAt`, `updatedAt`                                                                      | Derived search text, content fingerprint and stored row timestamps in milliseconds since the Unix epoch.                                                                                                                                                                                                                                                                                      |
| `query`, `limit`, `order`                                                                                                    | Search text, bounded result count and list ordering: `release`, `context` or `cost`.                                                                                                                                                                                                                                                                                                          |
| `includeDeprecated`, `excludeDeprecated`, `excludeFree`, `distinctCanonical`                                                 | Stored-row filters for retirement, zero prices and canonical duplicate offerings.                                                                                                                                                                                                                                                                                                             |
| `paginationOpts`, `page`, `isDone`, `continueCursor`, `pageStatus`, `splitCursor`                                            | Convex pagination input and result, including continuation and pinned-interval split metadata.                                                                                                                                                                                                                                                                                                |
| `isComplete`                                                                                                                 | Whether a cheapest-model scan reached its result count or exhausted its selected ranges.                                                                                                                                                                                                                                                                                                      |
| `usage`, `inputTokens`, `promptTokens`, `outputTokens`, `completionTokens`                                                   | Reported request token counts and AI SDK equivalent spellings.                                                                                                                                                                                                                                                                                                                                |
| `cacheReadTokens`, `cachedInputTokens`, `cacheWriteTokens`, `cacheWriteInputTokens`, `noCacheTokens`, `nonCachedInputTokens` | Cached and uncached input token counts and equivalent usage spellings.                                                                                                                                                                                                                                                                                                                        |
| `reasoningTokens`, `textOutputTokens`, `inputAudioTokens`, `outputAudioTokens`                                               | Reasoning, explicit text and audio token counts.                                                                                                                                                                                                                                                                                                                                              |
| `inputTokenScope`                                                                                                            | `includesCache` or `excludesCache`, explicitly declaring the meaning of reported input tokens.                                                                                                                                                                                                                                                                                                |
| `known`, `usd`, `nanoUsd`, `breakdown`, `tier`, `assumptions`, `modelUpdatedAt`                                              | Price availability, estimated USD and integer nano-USD, USD token-category costs, applied tier threshold, pricing assumptions, and the time in milliseconds the component last wrote the stored model row whose prices were used (`null` when the model has no stored row).                                                                                                                   |
| `uncachedInput`, `cacheRead`, `cacheWrite`, `inputAudio`, `text`, `outputAudio`                                              | USD cost breakdown categories; `reasoning` is also a USD cost category within the breakdown.                                                                                                                                                                                                                                                                                                  |
| `providerMetadata`, `rawUsage`, `rawProviderMetadata`                                                                        | AI SDK provider usage metadata and example passthrough usage values.                                                                                                                                                                                                                                                                                                                          |
| `state`                                                                                                                      | `never_synced` before a completed data sync, `ok` after completion and `error` after a failed attempt.                                                                                                                                                                                                                                                                                        |
| `lastStatus`                                                                                                                 | `ok` after data sync, `not_modified` after unchanged data, `partial` after a catalog-loss guard and `error` after failure.                                                                                                                                                                                                                                                                    |
| `partialReason`                                                                                                              | The catalog-loss guard that made a run `partial`: `price_loss` wrote no catalog rows; `removal` wrote rows and skipped deletion.                                                                                                                                                                                                                                                              |
| sync summary `status`, `reason`                                                                                              | Last-status outcomes plus `skipped`; skipped reasons are `disabled`, `min_interval` and `already_running`.                                                                                                                                                                                                                                                                                    |
| `running`, `leaseExpiresAt`, `lastCheckedAt`, `lastSyncedAt`, `durationMs`                                                   | Recorded lease flag, lease/check/sync timestamps in milliseconds since the Unix epoch and elapsed milliseconds.                                                                                                                                                                                                                                                                               |
| `errors`, `source`, `code`, `message`, `retryable`, `providerStatus`, `providerCode`                                         | Ordered fixed errors, the diagnostic source of each (`primary` or `fallback`), whether repeating the identical catalog read is safe and worthwhile, and provider diagnostics.                                                                                                                                                                                                                 |
| `added`, `updated`, `removed`, `priceChanges`, `skippedModels`                                                               | Sync row counters.                                                                                                                                                                                                                                                                                                                                                                            |
| `kind`, `before`, `after`, `changedAt`                                                                                       | History event (`added`, `removed`, `price`, `tiers`), price snapshots and event timestamp in milliseconds since the Unix epoch.                                                                                                                                                                                                                                                               |
| `enabled`, `sourceUrl`, `minIntervalMinutes`, `retentionDays`, `minProviders`, `minModels`                                   | Sync settings: cron enablement, catalog URL, minimum interval, history retention and usable-row floors. In sync status and summaries, `sourceUrl` is the catalog URL the run loaded.                                                                                                                                                                                                          |

## Catalog settings

`config.update(ctx, args)` changes table-backed settings; omitted fields retain their values.

| Setting              | Default                       | Accepted values and behavior                                                                                                              |
| -------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`            | `true`                        | `false` disables cron sync; manual sync and history cleanup still run.                                                                    |
| `sourceUrl`          | `https://models.dev/api.json` | HTTPS URL without credentials, query or fragment, at most 2048 UTF-8 bytes. The fallback is always `https://models.opencode.ai/api.json`. |
| `minIntervalMinutes` | `15`                          | Finite number at least 15; cron checks allow five minutes of tolerance.                                                                   |
| `retentionDays`      | `365`                         | Finite number at least 1; the hourly `cleanup` cron deletes history older than this.                                                      |
| `minProviders`       | `50`                          | Finite number at least 0; minimum providers with a usable model.                                                                          |
| `minModels`          | `1000`                        | Finite number at least 0; minimum usable models.                                                                                          |

`new ModelsDev(components.modelsDev, { aliases })` accepts provider aliases, defaulting to none. They extend `DEFAULT_PROVIDER_ALIASES`; per-call aliases override instance aliases. Client methods copy declared fields and discard undeclared fields, including nested usage fields; pagination forwards only `numItems`, `cursor` and `endCursor`.

## Cost estimation

```ts
import { estimateCost, extractUsage } from "@operatornest/convex-models-dev";

const row = await modelsDev.models.getByKey(ctx, { key: "openai/gpt-5.4" });
const estimate =
  row &&
  estimateCost(
    row,
    { inputTokens: 300_000, outputTokens: 2_000 },
    { mode: null, inputTokenScope: "includesCache" },
  );
```

`estimateCost` also runs without Convex. It returns `{ known: false }` when input/output prices are absent, a requested mode has no pricing, or a rounded nano-USD term or total is not a safe integer. Otherwise it returns `known`, `usd`, `nanoUsd`, USD `breakdown`, applied `tier` and `mode`, `assumptions` and `modelUpdatedAt`.

- Every supplied token count must be a nonnegative safe integer; NaN, infinities, negative counts, fractions and unsafe integers throw `MODELS_DEV_INVALID_ARGUMENT`, including for unresolved models. `inputTokens` or `promptTokens` requires an explicit `inputTokenScope`: `includesCache` or `excludesCache`.
- Reasoning and audio output are subtracted from total output before pricing text. Explicit `textOutputTokens` is used when total output is absent. Missing optional rates fall back to the input or output rate and add an assumption.
- The largest crossed context tier sets prices for the whole request. Thresholds ending in `001` use `>=`; other thresholds use `>`. `mode` is explicit: use `null` for base pricing. An unpriced requested mode returns `known: false`. Mode prices override base prices; mode tiers override those prices. Without mode tiers, a crossed base tier can only raise each mode rate and adds an assumption.
- Each cost term is rounded once to integer nano-USD before summation. Store `modelUpdatedAt` with a ledger entry: it is the stored row's write time, set by the sync that last changed the row, not an upstream models.dev date.

`extractUsage({ usage, providerMetadata })` maps AI SDK 5/6/7 usage spellings to `UsageInput`. Provider metadata fills missing cache fields. Provider aliases and usage semantics vary across SDKs; check your provider's counts. Tool fees, regional uplifts and cache durations are outside the estimator's pricing model.

## Catalog synchronization

`sync.run(ctx)` synchronizes with interval, removal and price-loss guards. `sync.runForced(ctx)` bypasses those guards. Both are actions. A failed sync records the failure instead of rethrowing: `sync.run`, `sync.runForced` and the hourly cron store the ordered `errors` in sync status and release the lease; `sync.run` and `sync.runForced` resolve with a `status: "error"` summary. A failed sync also sets `lastCheckedAt`, so the next `sync.run` or cron run within `minIntervalMinutes` is skipped with `min_interval`; this spaces retries against a failing upstream. Use `sync.runForced` to retry sooner. Overlapping runs are skipped while a lease is live. A lease lasts three minutes and each catalog mutation renews it. Writes and the finish are fenced by run ID, not by lease expiry: a run whose lease expired keeps writing until another run takes the lease, then stops with `MODELS_DEV_LEASE_LOST`.

A run conditionally fetches its configured source, then the fallback on failure, with a 60-second timeout per source and an 8 MiB streamed body limit. Requests do not follow redirects: a 3xx response is `MODELS_DEV_INVALID_RESPONSE`. The body is decoded as UTF-8 while it streams; a declared `content-length` or a streamed byte count above 8 MiB stops the read with `MODELS_DEV_CATALOG_TOO_LARGE`, and bytes that are not well-formed UTF-8 stop it with `MODELS_DEV_INVALID_RESPONSE`. A leading byte order mark is ignored when parsing. The limit keeps the measured peak action heap, about 3.8 times the catalog bytes (30.4 MiB for an 8 MiB catalog), at or below half of Convex's 64 MiB action memory. A 304 or unchanged source-qualified hash skips catalog writes; this still runs the begin and finish mutations. Parsed catalogs must satisfy the configured usable-row minimums before writes.

Normalization rejects malformed pricing, dates and reasoning bounds. Dates are calendar-valid `YYYY-MM-DD` or month-only `YYYY-MM` strings, stored verbatim; a month-only date compares lower than every full date in the same month, so `order: "release"` (newest first) lists it after them. A `budget_tokens` `min` must be at least -1 and `max` at least 0. A `status` string is stored verbatim; a non-string `status` makes the model malformed. Retained strings must be well-formed Unicode and fit in 16 KiB of UTF-8; indexed strings (`modelsDevProviderId`, `modelsDevModelId`, `family`, `modelsDevCanonicalModelId`, `releaseDate` and `searchText`) fit in 1 KiB; arrays and objects have at most 128 entries; normalized model rows fit in 4 KiB and normalized provider rows in 64 KiB of serialized JSON. Malformed models are skipped and their stored rows are preserved; malformed providers and their models are skipped and their stored rows are preserved. Unknown upstream fields are ignored.

Upserts use content hashes and batches of at most 100 rows or 512 KiB of serialized JSON. Price, tier and mode-price changes write history; added models write history after the first completed sync. Before any catalog write, an unforced run that would make more than 20% of stored priced models unpriced writes no catalog rows and records `partial`. Removal compares missing models with the catalog snapshot taken before upserts. More than 20% missing models skips model and provider deletion unless forced and records `partial`.

Every catalog write clears the previous ETag and body hash before modifying rows. Only a completed data sync restores them together with its source. Failed or interrupted writes therefore retry without a stale conditional shortcut. Sync is a sequence of transactions: readers can observe intermediate catalog rows. A run that fails mid-write leaves a mix of old and new rows, including models removed upstream, until the next completed run; the minimum interval and the hourly cron can delay that run, and `sync.runForced` repairs sooner.

`sync.getStatus` reads no clock. Compare `leaseExpiresAt` with your own clock to detect an expired recorded lease. `state` is `never_synced`, `ok` or `error`; `lastStatus` is `ok`, `not_modified`, `partial` or `error`. A partial run records its counters and `partialReason` and preserves the last completed timestamp. `errors` contains fixed-message diagnostics for each failed source attempt in attempt order, including failures before a successful fallback: `{ source: "primary" | "fallback", code, message, providerStatus? }`. Catalog write failures use the selected source. Counters are `providerCount`, `modelCount`, `added`, `updated`, `removed`, `priceChanges` and `skippedModels`.

## API reference

Methods take `(ctx, args)`; methods without arguments take `ctx`. `QueryContext` methods also work from mutation and action contexts.

| Method                    | Context           | Arguments                                                                                        | Result                                                                                                             |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `models.get`              | `QueryContext`    | `modelsDevProviderId`, `modelsDevModelId`                                                        | Model document or `null`.                                                                                          |
| `models.getByKey`         | `QueryContext`    | `key`                                                                                            | Model document or `null`; accepts `provider/model` and `provider:model`, checking at most eight provider prefixes. |
| `models.resolve`          | `QueryContext`    | `provider`, `model`, `aliases?`                                                                  | Model document or `null`; maps AI SDK provider strings to catalog IDs.                                             |
| `models.list`             | `QueryContext`    | Filters below, `paginationOpts`                                                                  | Paginated model documents.                                                                                         |
| `models.search`           | `QueryContext`    | `query`, `modelsDevProviderId?`, `family?`, `limit?`                                             | Text search over name, model ID, family and provider; default 10, maximum 50.                                      |
| `models.listCheapest`     | `QueryContext`    | Filters below, `limit?`                                                                          | `{ models, isComplete }`; default 5, maximum 20.                                                                   |
| `models.listEquivalents`  | `QueryContext`    | `modelsDevCanonicalModelId`, `limit?`                                                            | Matching documents ordered by blended price, unpriced documents last; default and maximum 200.                     |
| `models.listPriceChanges` | `QueryContext`    | `modelsDevProviderId`, `modelsDevModelId`, `limit?`                                              | History documents, newest first; default 50, maximum 200.                                                          |
| `models.estimateCost`     | `QueryContext`    | `provider`, `model`, `usage`, `aliases?`, `mode`, `inputTokenScope`                              | `CostEstimate`.                                                                                                    |
| `providers.list`          | `QueryContext`    | `paginationOpts`                                                                                 | Paginated provider documents, ordered by provider ID.                                                              |
| `providers.get`           | `QueryContext`    | `modelsDevProviderId`                                                                            | Provider document or `null`.                                                                                       |
| `sync.run`                | `ActionContext`   | None                                                                                             | `SyncSummary`; applies the interval, removal and price-loss guards.                                                |
| `sync.runForced`          | `ActionContext`   | None                                                                                             | `SyncSummary`; bypasses the interval, removal and price-loss guards.                                               |
| `sync.getStatus`          | `QueryContext`    | None                                                                                             | `SyncStatus`: sync state, lease, last completed counters and source errors.                                        |
| `config.get`              | `QueryContext`    | None                                                                                             | Effective settings.                                                                                                |
| `config.update`           | `MutationContext` | `enabled?`, `sourceUrl?`, `minIntervalMinutes?`, `retentionDays?`, `minProviders?`, `minModels?` | Effective settings; omitted settings retain their values.                                                          |

`models.list` filters are `modelsDevProviderId`, `family`, `status` (any string, matched exactly against the stored status), `reasoning`, `toolCall`, `structuredOutput`, `openWeights`, `inputModalities`, `outputModalities`, `minContextTokens`, `maxCostInput`, `type` (default: every type) and `includeDeprecated` (default `false`). `order` defaults to `release` (newest first); `context` orders largest first and `cost` orders cheapest first, excluding unpriced models. Provider and family filters select narrower indexes; other filters run during the scan.

`paginationOpts.numItems` must be an integer from 1 through 100. Each call reads at most `numItems + 1` rows and targets at most 1 MiB of document bytes; caller `maximumRowsRead` and `maximumBytesRead` values are ignored. `cursor` and `endCursor` must be well-formed, at most 4096 characters and a JSON array of at most the selected index’s declared field count plus 2 primitive values. Model indexes allow 3 values without a provider or family selection and 4 with either selection; the provider index allows 3. Shorter cursors remain valid prefix bounds. These bounds apply to both `models.list` and `providers.list`. The document that reaches the byte limit is included. Filters can return short or empty pages: continue until `isDone`. `endCursor` pins a page interval. If a bound interrupts that interval, use the returned `pageStatus` and `splitCursor` to split it. Use `usePaginatedQuery` from `convex-helpers/react` for reactive pagination.

`models.listCheapest` filters are `minContextTokens`, `minOutputTokens`, `reasoning`, `toolCall`, `structuredOutput`, `inputModalities`, `modelsDevProviderIds` (1 to 64 distinct IDs after deduplication; an empty array or more than 64 IDs throw `MODELS_DEV_INVALID_ARGUMENT`; omit it to select every provider), `type` (default: every type), `excludeFree` (default `false`), `excludeDeprecated` (default `true`) and `distinctCanonical` (default `false`). Ranking uses `(3 × input + output) / 4` USD per million tokens. It merges provider-and-cost index ranges when `modelsDevProviderIds` is supplied; otherwise it reads the cost index. A shared scan bound permits at most 1927 priced rows, including ties, so a scan of 4 KiB model rows reads at most half of Convex's 16 MiB per-query read limit. The result is `{ models, isComplete }`; `isComplete` is false if the scan bound stops the read before `limit` matches. A complete short result means the selected ranges were exhausted.

Numeric query filters must be finite and nonnegative. Result limits are floored and clamped to each method's range, with a minimum of 1. Modality filters accept only `text`, `audio`, `image`, `video` and `pdf`.

Pure named exports are `estimateCost`, `extractUsage`, `resolveModel`, `splitModelKey` and `listProviderCandidates`. Error exports are `MODELS_DEV_ERROR_CODES`, `ModelsDevErrorCode`, `ModelsDevErrorData` and `isModelsDevError`. `KNOWN_MODEL_STATUSES` lists the documented catalog model statuses. Exported status types are `PartialReason`, `SyncState`, `SyncRunStatus`, `SyncSummaryStatus`, `SyncSkipReason` and `PriceChangeKind`.

## Errors

Thrown errors are `ConvexError<ModelsDevErrorData>`. `isModelsDevError` checks the code, its fixed message and optional diagnostics. Provider and network errors alone carry `retryable`; HTTP failures carry `providerStatus`. Catalog requests are reads: network failures, timeouts and HTTP 408, 429 or 5xx are `retryable: true`; every other HTTP failure is `false`. Invalid or unexpected responses use `MODELS_DEV_INVALID_RESPONSE` and carry no `retryable`. Sync summaries and stored sync status contain one ordered `errors` array, including failed source attempts before successful fallback. Error messages exclude response content and caller values.

| Code                           | Message                                                           | When                                                                  |
| ------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `MODELS_DEV_INVALID_ARGUMENT`  | An argument is missing, malformed or out of bounds.               | Invalid query, cursor, usage or table-backed configuration arguments. |
| `MODELS_DEV_PROVIDER_ERROR`    | The catalog provider returned a failure response.                 | An HTTP response has a failure status.                                |
| `MODELS_DEV_NETWORK_ERROR`     | The request to models.dev failed before a response arrived.       | Fetch or a body read throws or times out.                             |
| `MODELS_DEV_INVALID_RESPONSE`  | The catalog response is malformed.                                | A 3xx response, or a body that is not UTF-8 or not a catalog.         |
| `MODELS_DEV_CATALOG_TOO_SMALL` | The catalog has fewer usable providers or models than configured. | Usable-row floors prevent catalog writes.                             |
| `MODELS_DEV_CATALOG_TOO_LARGE` | The catalog exceeds 8 MiB.                                        | Declared or streamed download bytes exceed the limit.                 |
| `MODELS_DEV_SYNC_FAILED`       | The catalog sync failed.                                          | A catalog write or another step without a specific code fails.        |
| `MODELS_DEV_LEASE_LOST`        | The sync run no longer owns its lease.                            | Another run took the lease before a write or completion.              |

## Testing

```ts
import { register } from "@operatornest/convex-models-dev/test";
import { convexTest } from "convex-test";

const t = convexTest(schema, modules);
register(t);
```

`register(t, name)` defaults to `modelsDev`. Stub `fetch` and lower the catalog minimums for small fixtures. The [example tests](https://github.com/OperatorNest/convex-models-dev/blob/main/example/convex/example.test.ts) demonstrate calls through the client. The test entrypoint provides its own `import.meta.glob` declaration and needs no Vite ambient types.

## Limits and retention

| Input                                        | Limit                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `paginationOpts.numItems`                    | Integer from 1 through 100                                                        |
| Rows read per page                           | `numItems + 1`                                                                    |
| Document bytes per page                      | 1 MiB target                                                                      |
| `cursor`, `endCursor`                        | 4096 characters; at most the index’s declared field count plus 2 primitive values |
| `models.search` `limit`                      | Default 10, maximum 50                                                            |
| `models.listCheapest` `limit`                | Default 5, maximum 20                                                             |
| `models.listCheapest` `modelsDevProviderIds` | 64 distinct IDs                                                                   |
| `models.listCheapest` scan                   | 1927 priced rows                                                                  |
| `models.listEquivalents` `limit`             | Default and maximum 200                                                           |
| `models.listPriceChanges` `limit`            | Default 50, maximum 200                                                           |
| `providers.list` result                      | Paginated; the shared row and byte bounds apply                                   |
| `models.getByKey` provider prefixes          | 8                                                                                 |
| `sourceUrl`                                  | 2048 UTF-8 bytes, HTTPS, no credentials, query or fragment                        |
| Catalog download                             | 8 MiB                                                                             |
| Indexed strings                              | 1 KiB of UTF-8                                                                    |
| Other retained strings                       | 16 KiB of UTF-8                                                                   |
| Arrays and objects                           | 128 entries                                                                       |
| Normalized row                               | 4 KiB (model) or 64 KiB (provider) of serialized JSON                             |
| Upsert batch                                 | 100 rows or 512 KiB of serialized JSON                                            |
| History deletion batch                       | 500 documents; a full batch schedules the next                                    |

The hourly `cleanup` cron runs whether or not `enabled` is set and whether or not syncs succeed. Each run reads `retentionDays` and deletes at most 500 expired history documents; a run that fills its batch schedules another run. History records model additions, removals, price changes and tier changes. `syncState` and `config` are singletons. Download, normalization, batch and query bounds are described above.

## Security

App wrappers authorize callers. Keep maintenance functions internal or require maintainer authorization; authenticate public catalog queries. Read [SECURITY.md](SECURITY.md).

## Development

Use Node 24 and pnpm 12.9.1 through mise. Read [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) and [ADRs](docs/adr/). Run `mise exec -- pnpm build:codegen`, `mise exec -- pnpm check` and `mise exec -- pnpm smoke`.

## License

[MIT](LICENSE). Catalog data is from [models.dev](https://models.dev), licensed MIT, copyright 2025 models.dev; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This package is unaffiliated with models.dev.
