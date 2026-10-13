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

In your app's Convex functions:

```ts
import { ModelsDev, syncSummaryValidator } from "@operatornest/convex-models-dev";
import { components } from "./_generated/api";
import { internalAction } from "./_generated/server";

const modelsDev = new ModelsDev(components.modelsDev);

export const syncNow = internalAction({
  args: {},
  returns: syncSummaryValidator,
  handler: (ctx) => modelsDev.sync.now(ctx),
});
```

The component does not authenticate callers. Keep maintenance wrappers internal or require maintainer authorization before calling `sync.now` or `config.update`. The [example app](https://github.com/OperatorNest/convex-models-dev/blob/main/example/convex/example.ts) uses internal maintenance functions and requires authentication for public queries. Configure your app's authentication provider before using those queries.

Before the first sync, catalog queries return empty results and `sync.status().state` is `never_synced`. The component owns its hourly cron.

## Configuration

`config.update(ctx, args)` changes table-backed settings; omitted fields retain their values. There are no component environment variables.

| Setting              | Default                       | Accepted values and behavior                                                                                           |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `enabled`            | `true`                        | `false` disables cron sync and history cleanup; manual sync still works.                                               |
| `sourceUrl`          | `https://models.dev/api.json` | HTTPS URL without credentials, at most 2048 UTF-8 bytes. The fallback is always `https://models.opencode.ai/api.json`. |
| `minIntervalMinutes` | `15`                          | Finite number at least 15; cron checks allow five minutes of tolerance.                                                |
| `retentionDays`      | `365`                         | Finite number at least 1; expired history is deleted only by enabled cron ticks.                                       |
| `minProviders`       | `50`                          | Finite number at least 0; minimum providers with a usable model.                                                       |
| `minModels`          | `1000`                        | Finite number at least 0; minimum usable models.                                                                       |

`new ModelsDev(components.modelsDev, { aliases })` accepts provider aliases, defaulting to none. They extend `DEFAULT_PROVIDER_ALIASES`; per-call aliases override instance aliases. Client methods copy declared fields and discard undeclared fields, including nested pagination and usage fields.

## Queries

Methods take `(ctx, args)`; methods without arguments take `ctx`. Query methods also work from mutation and action contexts that provide `runQuery`.

| Method                | Arguments                                                                | Result                                                                                                             |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `models.get`          | `providerId`, `modelId`                                                  | Model document or `null`.                                                                                          |
| `models.getByKey`     | `key`                                                                    | Model document or `null`; accepts `provider/model` and `provider:model`, checking at most eight provider prefixes. |
| `models.resolve`      | `provider`, `model`, `aliases?`                                          | Model document or `null`; maps AI SDK provider strings to catalog IDs.                                             |
| `models.list`         | Filters below, `paginationOpts`                                          | Paginated model documents.                                                                                         |
| `models.search`       | `query`, `providerId?`, `family?`, `limit?`                              | Text search over name, model ID, family and provider; default 10, maximum 50.                                      |
| `models.cheapest`     | Filters below, `limit?`                                                  | `{ models, isComplete }`; default 5, maximum 20.                                                                   |
| `models.equivalents`  | `canonicalModelId`, `limit?`                                             | Matching documents ordered by blended price, unpriced documents last; default and maximum 200.                     |
| `models.priceHistory` | `providerId`, `modelId`, `limit?`                                        | History documents, newest first; default 50, maximum 200.                                                          |
| `models.estimateCost` | `provider`, `model`, `usage`, `aliases?`, `mode?`, `inputIncludesCache?` | `CostEstimate`.                                                                                                    |
| `providers.list`      | None                                                                     | At most 500 provider documents, ordered by provider ID.                                                            |
| `providers.get`       | `providerId`                                                             | Provider document or `null`.                                                                                       |
| `sync.status`         | None                                                                     | Sync state, lease, last completed counters and source errors.                                                      |
| `config.get`          | None                                                                     | Effective settings.                                                                                                |

`models.list` filters are `providerId`, `family`, `status`, `reasoning`, `toolCall`, `structuredOutput`, `openWeights`, `inputModalities`, `outputModalities`, `minContext`, `maxCostInput` and `includeDeprecated` (default `false`). `order` defaults to `release` (newest first); `context` orders largest first and `cost` orders cheapest first, excluding unpriced models. Provider and family filters select narrower indexes; other filters run during the scan.

`paginationOpts.numItems` must be an integer from 1 through 100. Each call reads at most `numItems + 1` rows and targets at most 1 MiB of document bytes; smaller `maximumRowsRead` and `maximumBytesRead` values tighten those bounds. The document that reaches the byte limit is included. Filters can return short or empty pages: continue until `isDone`. `endCursor` pins a page interval. If a bound interrupts that interval, use the returned `pageStatus` and `splitCursor` to split it. Use `usePaginatedQuery` from `convex-helpers/react` for reactive pagination.

`models.cheapest` filters are `minContext`, `minOutput`, `reasoning`, `toolCall`, `structuredOutput`, `inputModalities`, `providerIds`, `excludeFree` (default `false`), `excludeDeprecated` (default `true`) and `distinctCanonical` (default `false`). Ranking uses `(3 × input + output) / 4` USD per million tokens. It merges provider-and-cost index ranges when `providerIds` is supplied; otherwise it reads the cost index. A shared scan bound permits at most 4000 priced rows, including ties. The result is `{ models, isComplete }`; `isComplete` is false if the scan bound stops the read before `limit` matches. A complete short result means the selected ranges were exhausted.

Numeric query filters must be finite and nonnegative. Result limits are floored and clamped to each method's range, with a minimum of 1. Modality filters accept only `text`, `audio`, `image`, `video` and `pdf`.

## Cost estimation

```ts
import { estimateCost, usageFromAgent } from "@operatornest/convex-models-dev";

const row = await modelsDev.models.getByKey(ctx, { key: "openai/gpt-5.4" });
const estimate = row && estimateCost(row, { inputTokens: 300_000, outputTokens: 2_000 });
```

`estimateCost` also runs without Convex. It returns `{ known: false }` when input/output prices are absent, a requested mode has no pricing, or a rounded nano-USD term or total is not a safe integer. Otherwise it returns `known`, `usd`, `nanoUsd`, USD `breakdown`, applied `tier` and `mode`, `assumptions` and `priceSnapshotAt`.

- Every supplied token count must be a nonnegative safe integer; NaN, infinities, negative counts, fractions and unsafe integers throw `MODELS_DEV_INVALID_ARGUMENT`, including for unresolved models. `inputTokens` or `promptTokens` includes cache tokens by default. Set `inputIncludesCache: false` when reported input excludes them.
- Reasoning and audio output are subtracted from total output before pricing text. Explicit `textOutputTokens` is used when total output is absent. Missing optional rates fall back to the input or output rate and add an assumption.
- The largest crossed context tier sets prices for the whole request. Thresholds ending in `001` use `>=`; other thresholds use `>`. `mode` defaults to none. An unpriced requested mode returns `known: false`. Mode prices override base prices; mode tiers override those prices. Without mode tiers, a crossed base tier can only raise each mode rate and adds an assumption.
- Each cost term is rounded once to integer nano-USD before summation. Store `priceSnapshotAt` with a ledger entry.

`usageFromAgent({ usage, providerMetadata })` maps AI SDK 5/6/7 usage spellings to `UsageInput`. Provider metadata fills missing cache fields. Provider aliases and usage semantics vary across SDKs; check your provider's counts. Tool fees, regional uplifts and cache durations are outside the estimator's pricing model.

## Sync and retention

`sync.now(ctx, { force })` is an action; `force` defaults to `false` and bypasses the interval floor, removal guard and price-loss guard. Overlapping runs are skipped while a lease is live. A lease lasts three minutes and each catalog mutation renews it.

A run conditionally fetches its configured source, then the fallback on failure, with a 60-second timeout per source and a 16 MiB streamed body limit. A 304 or unchanged source-qualified hash skips catalog writes; this still runs the begin and finish mutations. Parsed catalogs must satisfy the configured usable-row minimums before writes.

Normalization rejects malformed pricing, dates and reasoning bounds. Retained strings must be well-formed Unicode and fit in 16 KiB of UTF-8; indexed strings (`providerId`, `modelId`, `family`, `canonicalModelId`, `releaseDate` and `searchText`) fit in 1 KiB; arrays and objects have at most 128 entries and normalized rows fit in 64 KiB of serialized JSON. Malformed models are skipped and their stored rows are preserved; malformed providers and their models are skipped and their stored rows are preserved. Unknown upstream fields are ignored.

Upserts use content hashes and batches of at most 100 rows or 512 KiB of serialized JSON. Price, tier and mode-price changes write history; added models write history after the first completed sync. Before any catalog write, an unforced run that would make more than 20% of stored priced models unpriced writes no catalog rows and records `partial`. Removal compares missing models with the catalog snapshot taken before upserts. More than 20% missing models skips model and provider deletion unless forced and records `partial`.

Every catalog write clears the previous ETag and body hash before modifying rows. Only a completed data sync restores them together with its source. Failed or interrupted writes therefore retry without a stale conditional shortcut. Sync is a sequence of transactions: readers can observe intermediate catalog rows.

`sync.status` reads no clock. Compare `leaseExpiresAt` with your own clock to detect an expired recorded lease. `state` is `never_synced`, `ok` or `error`; `lastStatus` is `ok`, `not_modified`, `partial` or `error`. A partial run preserves the last completed timestamp and counters. `errors` contains fixed-message diagnostics for each failed source attempt in attempt order, including failures before a successful fallback: `{ source: "primary" | "fallback", code, message, providerStatus? }`. Catalog write failures use the selected source. Counters are `providerCount`, `modelCount`, `added`, `updated`, `removed`, `priceChanges`, `skippedModels` and `removalSkipped`.

Enabled cron ticks delete expired history in up to 20 batches of 500 documents. Each deletion mutation rereads `enabled` and `retentionDays`. History contains added, removed, price and tier events. `syncState` and `config` are singletons.

## Errors

Thrown package errors are `ConvexError<{ code, message, providerStatus? }>`. `isModelsDevError` validates the data shape. `providerStatus`, when present, is an HTTP status. Sync failures return `{ status: "error", error }` and return source diagnostics in `errors` and store them in `sync.status().errors`; skipped runs instead use `reason` (`disabled`, `min_interval` or `already_running`). Messages never include response bodies, headers or exception text.

| Code                            | Fixed message                                                                |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `MODELS_DEV_INVALID_CONFIG`     | A configuration value is nonfinite or below its minimum.                     |
| `MODELS_DEV_INVALID_SOURCE_URL` | The source URL must use HTTPS, omit credentials and fit in 2048 UTF-8 bytes. |
| `MODELS_DEV_INVALID_ARGUMENT`   | An argument is malformed or outside its bounds.                              |
| `MODELS_DEV_INVALID_CATALOG`    | The catalog is malformed.                                                    |
| `MODELS_DEV_CATALOG_TOO_SMALL`  | The catalog has fewer usable providers or models than configured.            |
| `MODELS_DEV_CATALOG_TOO_LARGE`  | The catalog exceeds 16 MiB.                                                  |
| `MODELS_DEV_FETCH_FAILED`       | The catalog request failed.                                                  |
| `MODELS_DEV_SYNC_FAILED`        | The catalog write failed.                                                    |
| `MODELS_DEV_LEASE_LOST`         | The sync run no longer owns its lease.                                       |

## Testing

```ts
import { register } from "@operatornest/convex-models-dev/test";
import { convexTest } from "convex-test";

const t = convexTest(schema, modules);
register(t);
```

`register(t, name)` defaults to `modelsDev`. Stub `fetch` and lower the catalog minimums for small fixtures. The [example tests](https://github.com/OperatorNest/convex-models-dev/blob/main/example/convex/example.test.ts) demonstrate calls through the client. The test entrypoint provides its own `import.meta.glob` declaration and needs no Vite ambient types.

## Security and development

Read [SECURITY.md](https://github.com/OperatorNest/convex-models-dev/blob/main/SECURITY.md), [CONTRIBUTING.md](https://github.com/OperatorNest/convex-models-dev/blob/main/CONTRIBUTING.md) and [AGENTS.md](https://github.com/OperatorNest/convex-models-dev/blob/main/AGENTS.md). Catalog data is untrusted; authorize app maintenance functions and retain the sync guards.

Catalog data is from [models.dev](https://models.dev), licensed MIT, copyright 2025 models.dev. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This package is unaffiliated with models.dev. Package license: [MIT](LICENSE).
