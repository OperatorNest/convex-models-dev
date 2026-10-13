# @operatornest/convex-models-dev

[![Release](https://github.com/OperatorNest/convex-models-dev/actions/workflows/release.yml/badge.svg)](https://github.com/OperatorNest/convex-models-dev/actions/workflows/release.yml)
[![npm](https://img.shields.io/npm/v/@operatornest/convex-models-dev)](https://www.npmjs.com/package/@operatornest/convex-models-dev)

Mirror the [models.dev](https://models.dev) model catalog into Convex tables. Query model capabilities, limits and prices; estimate token costs in integer nano-USD. The component uses Convex's default runtime, has no runtime dependencies and requires no secrets.

## Install

```sh
pnpm add @operatornest/convex-models-dev convex convex-helpers
```

Node.js 24 or newer, `convex ^1.46.0` and `convex-helpers ^0.1.127` are required.

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

Before the first sync, catalog queries return empty results and `sync.getStatus().state` is `never_synced`. The component owns its hourly cron.

## Concepts

Catalog terms follow the [models.dev schema](https://github.com/anomalyco/models.dev/blob/dev/packages/core/src/schema.ts).

| Term                                                                                                                         | Meaning                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models`                                                                                                                     | Stored models.dev model offerings, identified by catalog provider and model IDs.                                                                                                                                    |
| `providers`                                                                                                                  | Stored models.dev services offering catalog models.                                                                                                                                                                 |
| `sync`                                                                                                                       | Catalog download and lease-fenced synchronization operations.                                                                                                                                                       |
| `config`                                                                                                                     | Table-backed synchronization settings.                                                                                                                                                                              |
| `_id`, `_creationTime`                                                                                                       | Convex document identity and creation timestamp in milliseconds since the Unix epoch.                                                                                                                               |
| `modelsDevProviderId`, `modelsDevProviderIds`                                                                                | models.dev provider identifiers, individually or as a selection.                                                                                                                                                    |
| `modelsDevModelId`, `modelsDevCanonicalModelId`                                                                              | models.dev offering identifier and optional canonical lab/model identifier.                                                                                                                                         |
| `key`, `provider`, `model`, `aliases`                                                                                        | Provider-qualified model key, AI SDK provider name, model name and provider-name mappings used for resolution.                                                                                                      |
| `name`, `family`, `description`, `knowledge`                                                                                 | Catalog display name, model family, description and knowledge cutoff date.                                                                                                                                          |
| `attachment`, `reasoning`, `toolCall`, `structuredOutput`, `temperature`, `openWeights`                                      | Catalog capability flags converted from source names to camelCase.                                                                                                                                                  |
| `status`                                                                                                                     | Model maturity: `alpha` and `beta` mark prerelease offerings; `deprecated` marks retired offerings; omission means no catalog status; synchronization copies source status changes without a local transition rule. |
| `reasoningOptions`                                                                                                           | Catalog reasoning controls: `toggle`, `effort` with allowed `values`, or `budget_tokens` with `min` and `max`.                                                                                                      |
| `interleaved`, `field`                                                                                                       | Whether reasoning is interleaved, or the response field carrying reasoning.                                                                                                                                         |
| `context`, `input`, `output`                                                                                                 | Catalog context window, optional input limit and output limit, in tokens.                                                                                                                                           |
| `minContextTokens`, `minOutputTokens`                                                                                        | Minimum context window and output limit for a query.                                                                                                                                                                |
| `inputModalities`, `outputModalities`, `inputMask`, `outputMask`                                                             | Selected or encoded `text`, `audio`, `image`, `video` and `pdf` modalities.                                                                                                                                         |
| `releaseDate`, `lastUpdated`                                                                                                 | Catalog release and update dates.                                                                                                                                                                                   |
| `costInput`, `costOutput`, `costCacheRead`, `costCacheWrite`, `costReasoning`, `costInputAudio`, `costOutputAudio`           | Catalog USD prices per million tokens.                                                                                                                                                                              |
| `hasCost`, `costBlended`, `costOrder`, `maxCostInput`                                                                        | Availability of base pricing, weighted input/output price, its negation for ordering, and an input-price ceiling in USD per million tokens.                                                                         |
| `tiers`, `size`                                                                                                              | Context pricing tiers and their token thresholds.                                                                                                                                                                   |
| `modes`, `mode`                                                                                                              | Catalog pricing modes and the selected pricing mode; `null` selects base pricing.                                                                                                                                   |
| `npm`, `api`, `doc`, `env`, `shape`                                                                                          | Catalog provider package, endpoint, documentation, credential-variable names and response shape; this component reads no provider credentials.                                                                      |
| `modelCount`, `providerCount`                                                                                                | Counts of usable models and providers.                                                                                                                                                                              |
| `searchText`, `contentHash`, `firstSeenAt`, `updatedAt`                                                                      | Derived search text, content fingerprint and stored row timestamps in milliseconds since the Unix epoch.                                                                                                            |
| `query`, `limit`, `order`                                                                                                    | Search text, bounded result count and list ordering: `release`, `context` or `cost`.                                                                                                                                |
| `includeDeprecated`, `excludeDeprecated`, `excludeFree`, `distinctCanonical`                                                 | Stored-row filters for retirement, zero prices and canonical duplicate offerings.                                                                                                                                   |
| `paginationOpts`, `page`, `isDone`, `continueCursor`, `pageStatus`, `splitCursor`                                            | Convex pagination input and result, including continuation and pinned-interval split metadata.                                                                                                                      |
| `isComplete`                                                                                                                 | Whether a cheapest-model scan reached its result count or exhausted its selected ranges.                                                                                                                            |
| `usage`, `inputTokens`, `promptTokens`, `outputTokens`, `completionTokens`                                                   | Reported request token counts and AI SDK equivalent spellings.                                                                                                                                                      |
| `cacheReadTokens`, `cachedInputTokens`, `cacheWriteTokens`, `cacheWriteInputTokens`, `noCacheTokens`, `nonCachedInputTokens` | Cached and uncached input token counts and equivalent usage spellings.                                                                                                                                              |
| `reasoningTokens`, `textOutputTokens`, `inputAudioTokens`, `outputAudioTokens`                                               | Reasoning, explicit text and audio token counts.                                                                                                                                                                    |
| `inputTokenScope`                                                                                                            | `includesCache` or `excludesCache`, explicitly declaring the meaning of reported input tokens.                                                                                                                      |
| `known`, `usd`, `nanoUsd`, `breakdown`, `tier`, `assumptions`, `priceSnapshotAt`                                             | Price availability, estimated USD and integer nano-USD, USD token-category costs, applied tier threshold, pricing assumptions and snapshot timestamp in milliseconds.                                               |
| `uncachedInput`, `cacheRead`, `cacheWrite`, `inputAudio`, `text`, `outputAudio`                                              | USD cost breakdown categories; `reasoning` is also a USD cost category within the breakdown.                                                                                                                        |
| `providerMetadata`, `rawUsage`, `rawProviderMetadata`                                                                        | AI SDK provider usage metadata and example passthrough usage values.                                                                                                                                                |
| `state`                                                                                                                      | `never_synced` before a completed data sync, `ok` after completion and `error` after a failed attempt.                                                                                                              |
| `lastStatus`                                                                                                                 | `ok` after data sync, `not_modified` after unchanged data, `partial` after a catalog-loss guard and `error` after failure.                                                                                          |
| sync summary `status`, `reason`                                                                                              | Last-status outcomes plus `skipped`; skipped reasons are `disabled`, `min_interval` and `already_running`.                                                                                                          |
| `running`, `leaseExpiresAt`, `lastCheckedAt`, `lastSyncedAt`, `durationMs`                                                   | Recorded lease flag, lease/check/sync timestamps in milliseconds since the Unix epoch and elapsed milliseconds.                                                                                                     |
| `source`, `errors`, `code`, `message`, `retryable`, `providerStatus`, `providerCode`                                         | Catalog URL or diagnostic source (`primary` or `fallback`), ordered fixed errors, retry eligibility and provider diagnostics.                                                                                       |
| `added`, `updated`, `removed`, `priceChanges`, `skippedModels`, `removalSkipped`                                             | Sync row counters and whether a catalog-loss guard prevented writes or removal.                                                                                                                                     |
| `kind`, `before`, `after`, `changedAt`                                                                                       | History event (`added`, `removed`, `price`, `tiers`), price snapshots and event timestamp in milliseconds since the Unix epoch.                                                                                     |
| `enabled`, `sourceUrl`, `minIntervalMinutes`, `retentionDays`, `minProviders`, `minModels`                                   | Sync settings: cron enablement, catalog destination, minimum interval, history retention and usable-row floors.                                                                                                     |

## Catalog settings

`config.update(ctx, args)` changes table-backed settings; omitted fields retain their values.

| Setting              | Default                       | Accepted values and behavior                                                                                           |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `enabled`            | `true`                        | `false` disables cron sync and history cleanup; manual sync still works.                                               |
| `sourceUrl`          | `https://models.dev/api.json` | HTTPS URL without credentials, at most 2048 UTF-8 bytes. The fallback is always `https://models.opencode.ai/api.json`. |
| `minIntervalMinutes` | `15`                          | Finite number at least 15; cron checks allow five minutes of tolerance.                                                |
| `retentionDays`      | `365`                         | Finite number at least 1; expired history is deleted only by enabled cron ticks.                                       |
| `minProviders`       | `50`                          | Finite number at least 0; minimum providers with a usable model.                                                       |
| `minModels`          | `1000`                        | Finite number at least 0; minimum usable models.                                                                       |

`new ModelsDev(components.modelsDev, { aliases })` accepts provider aliases, defaulting to none. They extend `DEFAULT_PROVIDER_ALIASES`; per-call aliases override instance aliases. Client methods copy declared fields and discard undeclared fields, including nested pagination and usage fields.

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

`estimateCost` also runs without Convex. It returns `{ known: false }` when input/output prices are absent, a requested mode has no pricing, or a rounded nano-USD term or total is not a safe integer. Otherwise it returns `known`, `usd`, `nanoUsd`, USD `breakdown`, applied `tier` and `mode`, `assumptions` and `priceSnapshotAt`.

- Every supplied token count must be a nonnegative safe integer; NaN, infinities, negative counts, fractions and unsafe integers throw `MODELS_DEV_INVALID_ARGUMENT`, including for unresolved models. `inputTokens` or `promptTokens` requires an explicit `inputTokenScope`: `includesCache` or `excludesCache`.
- Reasoning and audio output are subtracted from total output before pricing text. Explicit `textOutputTokens` is used when total output is absent. Missing optional rates fall back to the input or output rate and add an assumption.
- The largest crossed context tier sets prices for the whole request. Thresholds ending in `001` use `>=`; other thresholds use `>`. `mode` is explicit: use `null` for base pricing. An unpriced requested mode returns `known: false`. Mode prices override base prices; mode tiers override those prices. Without mode tiers, a crossed base tier can only raise each mode rate and adds an assumption.
- Each cost term is rounded once to integer nano-USD before summation. Store `priceSnapshotAt` with a ledger entry.

`extractUsage({ usage, providerMetadata })` maps AI SDK 5/6/7 usage spellings to `UsageInput`. Provider metadata fills missing cache fields. Provider aliases and usage semantics vary across SDKs; check your provider's counts. Tool fees, regional uplifts and cache durations are outside the estimator's pricing model.

## Catalog synchronization

`sync.run(ctx)` synchronizes with interval, removal and price-loss guards. `sync.runForced(ctx)` bypasses those guards. Both are actions. Overlapping runs are skipped while a lease is live. A lease lasts three minutes and each catalog mutation renews it.

A run conditionally fetches its configured source, then the fallback on failure, with a 60-second timeout per source and a 16 MiB streamed body limit. A 304 or unchanged source-qualified hash skips catalog writes; this still runs the begin and finish mutations. Parsed catalogs must satisfy the configured usable-row minimums before writes.

Normalization rejects malformed pricing, dates and reasoning bounds. Retained strings must be well-formed Unicode and fit in 16 KiB of UTF-8; indexed strings (`modelsDevProviderId`, `modelsDevModelId`, `family`, `modelsDevCanonicalModelId`, `releaseDate` and `searchText`) fit in 1 KiB; arrays and objects have at most 128 entries and normalized rows fit in 64 KiB of serialized JSON. Malformed models are skipped and their stored rows are preserved; malformed providers and their models are skipped and their stored rows are preserved. Unknown upstream fields are ignored.

Upserts use content hashes and batches of at most 100 rows or 512 KiB of serialized JSON. Price, tier and mode-price changes write history; added models write history after the first completed sync. Before any catalog write, an unforced run that would make more than 20% of stored priced models unpriced writes no catalog rows and records `partial`. Removal compares missing models with the catalog snapshot taken before upserts. More than 20% missing models skips model and provider deletion unless forced and records `partial`.

Every catalog write clears the previous ETag and body hash before modifying rows. Only a completed data sync restores them together with its source. Failed or interrupted writes therefore retry without a stale conditional shortcut. Sync is a sequence of transactions: readers can observe intermediate catalog rows.

`sync.getStatus` reads no clock. Compare `leaseExpiresAt` with your own clock to detect an expired recorded lease. `state` is `never_synced`, `ok` or `error`; `lastStatus` is `ok`, `not_modified`, `partial` or `error`. A partial run preserves the last completed timestamp and counters. `errors` contains fixed-message diagnostics for each failed source attempt in attempt order, including failures before a successful fallback: `{ source: "primary" | "fallback", code, message, providerStatus? }`. Catalog write failures use the selected source. Counters are `providerCount`, `modelCount`, `added`, `updated`, `removed`, `priceChanges`, `skippedModels` and `removalSkipped`.

## API reference

Methods take `(ctx, args)`; methods without arguments take `ctx`. Query methods also work from mutation and action contexts that provide `runQuery`.

| Method                    | Arguments                                                           | Result                                                                                                             |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `models.get`              | `modelsDevProviderId`, `modelsDevModelId`                           | Model document or `null`.                                                                                          |
| `models.getByKey`         | `key`                                                               | Model document or `null`; accepts `provider/model` and `provider:model`, checking at most eight provider prefixes. |
| `models.resolve`          | `provider`, `model`, `aliases?`                                     | Model document or `null`; maps AI SDK provider strings to catalog IDs.                                             |
| `models.list`             | Filters below, `paginationOpts`                                     | Paginated model documents.                                                                                         |
| `models.search`           | `query`, `modelsDevProviderId?`, `family?`, `limit?`                | Text search over name, model ID, family and provider; default 10, maximum 50.                                      |
| `models.listCheapest`     | Filters below, `limit?`                                             | `{ models, isComplete }`; default 5, maximum 20.                                                                   |
| `models.listEquivalents`  | `modelsDevCanonicalModelId`, `limit?`                               | Matching documents ordered by blended price, unpriced documents last; default and maximum 200.                     |
| `models.listPriceChanges` | `modelsDevProviderId`, `modelsDevModelId`, `limit?`                 | History documents, newest first; default 50, maximum 200.                                                          |
| `models.estimateCostCost` | `provider`, `model`, `usage`, `aliases?`, `mode`, `inputTokenScope` | `CostEstimate`.                                                                                                    |
| `providers.list`          | None                                                                | At most 500 provider documents, ordered by provider ID.                                                            |
| `providers.get`           | `modelsDevProviderId`                                               | Provider document or `null`.                                                                                       |
| `sync.getStatus`          | None                                                                | Sync state, lease, last completed counters and source errors.                                                      |
| `config.get`              | None                                                                | Effective settings.                                                                                                |

`models.list` filters are `modelsDevProviderId`, `family`, `status`, `reasoning`, `toolCall`, `structuredOutput`, `openWeights`, `inputModalities`, `outputModalities`, `minContextTokens`, `maxCostInput` and `includeDeprecated` (default `false`). `order` defaults to `release` (newest first); `context` orders largest first and `cost` orders cheapest first, excluding unpriced models. Provider and family filters select narrower indexes; other filters run during the scan.

`paginationOpts.numItems` must be an integer from 1 through 100. Each call reads at most `numItems + 1` rows and targets at most 1 MiB of document bytes; smaller `maximumRowsRead` and `maximumBytesRead` values tighten those bounds. The document that reaches the byte limit is included. Filters can return short or empty pages: continue until `isDone`. `endCursor` pins a page interval. If a bound interrupts that interval, use the returned `pageStatus` and `splitCursor` to split it. Use `usePaginatedQuery` from `convex-helpers/react` for reactive pagination.

`models.listCheapest` filters are `minContextTokens`, `minOutputTokens`, `reasoning`, `toolCall`, `structuredOutput`, `inputModalities`, `modelsDevProviderIds`, `excludeFree` (default `false`), `excludeDeprecated` (default `true`) and `distinctCanonical` (default `false`). Ranking uses `(3 × input + output) / 4` USD per million tokens. It merges provider-and-cost index ranges when `modelsDevProviderIds` is supplied; otherwise it reads the cost index. A shared scan bound permits at most 4000 priced rows, including ties. The result is `{ models, isComplete }`; `isComplete` is false if the scan bound stops the read before `limit` matches. A complete short result means the selected ranges were exhausted.

Numeric query filters must be finite and nonnegative. Result limits are floored and clamped to each method's range, with a minimum of 1. Modality filters accept only `text`, `audio`, `image`, `video` and `pdf`.

`sync.run(ctx)` and `sync.runForced(ctx)` synchronize the catalog. `config.update(ctx, args)` updates table-backed settings.

Pure named exports are `estimateCost`, `extractUsage`, `resolveModel`, `splitModelKey` and `listProviderCandidates`. Error exports are `MODELS_DEV_ERROR_CODES`, `ModelsDevErrorCode`, `ModelsDevErrorData` and `isModelsDevError`. Exported status types are `ModelStatus`, `SyncState`, `SyncRunStatus`, `SyncSummaryStatus`, `SyncSkipReason` and `PriceChangeKind`.

## Errors

Thrown errors are `ConvexError<ModelsDevErrorData>`. `isModelsDevError` checks the code, its fixed message and optional diagnostics. Provider and network errors alone carry `retryable`; HTTP failures carry `providerStatus`. Sync summaries and stored sync status contain one ordered `errors` array, including failed source attempts before successful fallback. Error messages exclude response content and caller values.

| Code                           | Message                                                           | When                                                          |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `MODELS_DEV_INVALID_ARGUMENT`  | An argument is malformed or outside its bounds.                   | Invalid query, usage or table-backed configuration arguments. |
| `MODELS_DEV_PROVIDER_ERROR`    | The catalog provider returned a failure response.                 | An HTTP response has a failure status.                        |
| `MODELS_DEV_NETWORK_ERROR`     | The catalog request produced no response.                         | Fetch throws or times out without a response.                 |
| `MODELS_DEV_INVALID_RESPONSE`  | The catalog response is malformed.                                | A successful response cannot be parsed as a catalog.          |
| `MODELS_DEV_CATALOG_TOO_SMALL` | The catalog has fewer usable providers or models than configured. | Usable-row floors prevent catalog writes.                     |
| `MODELS_DEV_CATALOG_TOO_LARGE` | The catalog exceeds 16 MiB.                                       | Declared or streamed download bytes exceed the limit.         |
| `MODELS_DEV_SYNC_FAILED`       | The catalog write failed.                                         | A catalog transaction fails.                                  |
| `MODELS_DEV_LEASE_LOST`        | The sync run no longer owns its lease.                            | A write or completion loses its live lease.                   |

## Testing

```ts
import { register } from "@operatornest/convex-models-dev/test";
import { convexTest } from "convex-test";

const t = convexTest(schema, modules);
register(t);
```

`register(t, name)` defaults to `modelsDev`. Stub `fetch` and lower the catalog minimums for small fixtures. The [example tests](https://github.com/OperatorNest/convex-models-dev/blob/main/example/convex/example.test.ts) demonstrate calls through the client. The test entrypoint provides its own `import.meta.glob` declaration and needs no Vite ambient types.

## Limits and retention

Enabled cron ticks delete expired history in at most 20 batches of 500 documents. Each deletion mutation rereads `enabled` and `retentionDays`. History records model additions, removals, price changes and tier changes. `syncState` and `config` are singletons. Download, normalization, batch and query bounds are described above.

## Security

App wrappers authorize callers. Keep maintenance functions internal or require maintainer authorization; authenticate public catalog queries. Read [SECURITY.md](SECURITY.md).

## Development

Use Node 24 and pnpm 12.9.1 through mise. Read [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) and [ADRs](docs/adr/). Run `mise exec -- pnpm build:codegen`, `mise exec -- pnpm check` and `mise exec -- pnpm smoke`.

## License

[MIT](LICENSE). Catalog data is from [models.dev](https://models.dev), licensed MIT, copyright 2025 models.dev; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This package is unaffiliated with models.dev.
