# @operatornest/convex-models-dev

[![Release](https://github.com/OperatorNest/convex-models-dev/actions/workflows/release.yml/badge.svg)](https://github.com/OperatorNest/convex-models-dev/actions/workflows/release.yml)
[![npm](https://img.shields.io/npm/v/@operatornest/convex-models-dev)](https://www.npmjs.com/package/@operatornest/convex-models-dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A live, queryable copy of the [models.dev](https://models.dev) catalog of AI models, limits and pricing, inside your Convex deployment. It also ships a pure, tested cost estimator that turns token usage into nano-USD.

Verified against: the public `https://models.dev/api.json`, about 8,400 models from 220+ providers as of October 2026.

- Synced hourly with a conditional GET (`If-None-Match`). When nothing changed, a run costs one small request and one small mutation.
- Per-row content hashes, so only changed models are written and reactive queries re-run only for those.
- Queries for lookup by key, filtered and paginated listing, text search, "cheapest that fits", "same model across providers" and price history.
- `estimateCost`: integer nano-USD math with context tiers, `experimental.modes` (for example `fast`), cache read and write, reasoning and audio rates. It returns `{ known: false }` for models without a price, never 0.
- `usageFromAgent` and `resolveModel` bridge `@convex-dev/agent` and AI SDK usage and provider strings to models.dev ids.
- No runtime dependencies, no secrets, default Convex runtime only.

## Install

```sh
pnpm add @operatornest/convex-models-dev convex convex-helpers
```

`convex` (`^1.46.0`) and `convex-helpers` (`^0.1.106`) are peer dependencies. `convex-helpers` provides `paginator`, which the component uses for pagination.

`convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import modelsDev from "@operatornest/convex-models-dev/convex.config.js";

const app = defineApp();
app.use(modelsDev);
export default app;
```

## Configure

The component needs no environment variables. Its settings live in the component's `config` table and you change them with `client.config.update`. The component schedules its own hourly cron, so you do not wire one up.

| Setting              | Default                       | Notes                                                                                                        |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `enabled`            | `true`                        | When `false` the cron does nothing. `sync.now` still works.                                                  |
| `sourceUrl`          | `https://models.dev/api.json` | Must be https and carry no credentials. `https://models.opencode.ai/api.json` is always tried as a fallback. |
| `minIntervalMinutes` | `15`                          | Minimum time between checks. Values below 15 are rejected. The cron gets 5 minutes of tolerance.             |
| `retentionDays`      | `365`                         | Price history older than this is deleted by the hourly run.                                                  |
| `minProviders`       | `50`                          | A payload with fewer usable providers aborts the sync.                                                       |
| `minModels`          | `1000`                        | A payload with fewer usable models aborts the sync.                                                          |

Client options (`new ModelsDev(component, options?)`):

| Option    | Description                                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `aliases` | Extra AI SDK provider string to models.dev provider id mappings, applied to `models.resolve` and `models.estimateCost`. Per-call `aliases` win. |

## Quick start

```ts
// convex/models.ts
import {
  ModelsDev,
  syncStatusValidator,
  syncSummaryValidator,
} from "@operatornest/convex-models-dev";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { action, query } from "./_generated/server";

const modelsDev = new ModelsDev(components.modelsDev);

const modelSummary = v.object({
  providerId: v.string(),
  modelId: v.string(),
  name: v.string(),
  contextLimit: v.number(),
  costInput: v.optional(v.number()),
  costOutput: v.optional(v.number()),
});

// Run once to load the catalog. The hourly cron keeps it fresh afterwards.
export const syncNow = action({
  args: {},
  returns: syncSummaryValidator,
  handler: (ctx) => modelsDev.sync.now(ctx),
});

export const syncStatus = query({
  args: {},
  returns: syncStatusValidator,
  handler: (ctx) => modelsDev.sync.status(ctx),
});

export const model = query({
  args: { key: v.string() }, // "openai/gpt-5.4" or "openai:gpt-5.4"
  returns: v.union(modelSummary, v.null()),
  handler: async (ctx, { key }) => {
    const row = await modelsDev.models.getByKey(ctx, { key });
    if (!row) return null;
    return {
      providerId: row.providerId,
      modelId: row.modelId,
      name: row.name,
      contextLimit: row.contextLimit,
      ...(row.costInput !== undefined && { costInput: row.costInput }),
      ...(row.costOutput !== undefined && { costOutput: row.costOutput }),
    };
  },
});

export const cheapestWithTools = query({
  args: {},
  returns: v.array(modelSummary),
  handler: async (ctx) => {
    const rows = await modelsDev.models.cheapest(ctx, {
      toolCall: true,
      minContext: 128_000,
      excludeFree: true,
      limit: 5,
    });
    return rows.map((row) => ({
      providerId: row.providerId,
      modelId: row.modelId,
      name: row.name,
      contextLimit: row.contextLimit,
      ...(row.costInput !== undefined && { costInput: row.costInput }),
      ...(row.costOutput !== undefined && { costOutput: row.costOutput }),
    }));
  },
});
```

Until the first sync, queries return empty results and `sync.status(ctx).state` is `"never_synced"`, so you can show a clear state. Protect `sync.now` and `config.update` with your own auth: the component does not authenticate callers.

### Estimating cost

```ts
const estimate = await modelsDev.models.estimateCost(ctx, {
  provider: "anthropic.messages", // AI SDK provider string or a models.dev id
  model: "claude-sonnet-4-5",
  usage: { inputTokens: 12_000, outputTokens: 800, cacheReadTokens: 9_000 },
});
if (estimate.known)
  console.log(estimate.nanoUsd, estimate.usd, estimate.tier, estimate.assumptions);
```

`estimateCost` is also exported as a pure function, so you can price cached rows without calling the component:

```ts
import { estimateCost } from "@operatornest/convex-models-dev";

const row = await modelsDev.models.getByKey(ctx, { key: "openai/gpt-5.4" });
const result =
  row && estimateCost(row, { inputTokens: 300_000, outputTokens: 2_000 }, { mode: "fast" });
```

Rules:

- Token counts are clamped to whole numbers >= 0. `inputTokens` (or `promptTokens`) is the total prompt, including cache tokens. Pass `inputIncludesCache: false` for providers that report cache tokens separately, such as raw Anthropic usage.
- `reasoningTokens` are a subset of `outputTokens`, never added twice. Missing optional prices fall back to the input or output rate and are listed in `assumptions`.
- The largest context tier whose `size` the prompt exceeds replaces the base prices for the whole request. Sizes ending in `001` (for example 200001) mean "starts at". A `mode` that has its own cost overrides the base first. If the mode defines its own tiers those apply. Otherwise a crossed base tier can only raise the mode's price (per-field max), and `assumptions` gets `mode_without_tiers: used max(mode, base tier) per field`.
- Each term is rounded once to integer nano-USD and the integers are summed. Store `priceSnapshotAt` next to any ledger entry.

### With `@convex-dev/agent`

This is a code sample only. `@convex-dev/agent` is not a dependency of this package.

```ts
// convex/support.ts
import { openai } from "@ai-sdk/openai";
import { Agent } from "@convex-dev/agent";
import { ModelsDev, usageFromAgent } from "@operatornest/convex-models-dev";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const modelsDev = new ModelsDev(components.modelsDev);

export const record = internalMutation({
  args: {
    agentName: v.optional(v.string()),
    userId: v.optional(v.string()),
    provider: v.string(),
    model: v.string(),
    nanoUsd: v.union(v.number(), v.null()),
    priceSnapshotAt: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Store the entry in your own ledger table here.
    console.log(args);
    return null;
  },
});

export const supportAgent = new Agent(components.agent, {
  name: "support",
  languageModel: openai.chat("gpt-5.4"),
  usageHandler: async (ctx, { usage, providerMetadata, model, provider, agentName, userId }) => {
    const estimate = await modelsDev.models.estimateCost(ctx, {
      provider, // e.g. "openai.chat"; normalized for you
      model,
      usage: usageFromAgent({ usage, providerMetadata }),
    });
    await ctx.runMutation(internal.support.record, {
      agentName,
      userId,
      provider,
      model,
      // null means "price unknown", which is different from free.
      nanoUsd: estimate.known ? estimate.nanoUsd : null,
      priceSnapshotAt: estimate.known ? estimate.priceSnapshotAt : null,
    });
  },
});
```

`usageFromAgent` understands the AI SDK 5/6 spellings (`cachedInputTokens`, `reasoningTokens`), the AI SDK 7 `inputTokenDetails` and `outputTokenDetails`, and fills missing cache fields from `providerMetadata` (OpenAI `cachedPromptTokens`, Anthropic `cacheCreationInputTokens`). `usageHandler` runs in an action context, so `runQuery` through the client works there.

## API reference

The client is `new ModelsDev(components.modelsDev, options?)`. Every method takes `(ctx, args)`. Methods without arguments take only `ctx`.

| Method                                                      | Context  | Description                                                                                                                                                              |
| ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `models.get(ctx, {providerId, modelId})`                    | query    | One row, or `null`.                                                                                                                                                      |
| `models.getByKey(ctx, {key})`                               | query    | One row by `"provider/model"` or `"provider:model"`, or `null`. Splits on the first separator whose left side is a provider id. At most 8 prefix candidates are checked. |
| `models.resolve(ctx, {provider, model, aliases?})`          | query    | Maps an AI SDK provider string to a catalog row, or `null`.                                                                                                              |
| `models.list(ctx, args)`                                    | query    | Paginated, filtered list (filters below).                                                                                                                                |
| `models.search(ctx, {query, providerId?, family?, limit?})` | query    | Search index over name, id, family and provider. Up to 50 results.                                                                                                       |
| `models.cheapest(ctx, args?)`                               | query    | Lowest blended price that matches the filters. Up to 20 results.                                                                                                         |
| `models.equivalents(ctx, {canonicalModelId, limit?})`       | query    | Every provider serving the same canonical model, cheapest first. Up to 200.                                                                                              |
| `models.priceHistory(ctx, {providerId, modelId, limit?})`   | query    | Recorded price and tier changes, newest first. Up to 200.                                                                                                                |
| `models.estimateCost(ctx, args)`                            | query    | Resolve, look up and estimate in one query. Returns a `CostEstimate`.                                                                                                    |
| `providers.list(ctx)`                                       | query    | Provider rows (up to 500).                                                                                                                                               |
| `providers.get(ctx, {providerId})`                          | query    | One provider row, or `null`.                                                                                                                                             |
| `sync.status(ctx)`                                          | query    | Sync state, last run counters and error. See below.                                                                                                                      |
| `sync.now(ctx, {force?}?)`                                  | action   | Runs a sync. `force` skips the interval floor and the removal guard. Returns a `SyncSummary`.                                                                            |
| `config.get(ctx)`                                           | query    | Effective settings.                                                                                                                                                      |
| `config.update(ctx, args)`                                  | mutation | Changes settings. Omitted fields keep their value. Throws `MODELS_DEV_INVALID_CONFIG` or `MODELS_DEV_INVALID_SOURCE_URL`.                                                |

Component functions (`components.modelsDev.*`): `models.get`, `models.getByKey`, `models.resolve`, `models.list`, `models.search`, `models.cheapest`, `models.equivalents`, `models.priceHistory`, `models.estimate`, `providers.list`, `providers.get`, `sync.status`, `sync.syncNow`, `config.get`, `config.configure`. `sync.tick` (the cron) and the sync mutations are internal.

`models.list` filters: `providerId`, `family`, `status`, `reasoning`, `toolCall`, `structuredOutput`, `openWeights`, `inputModalities`, `outputModalities`, `minContext`, `maxCostInput`, `includeDeprecated` (the default excludes `status: "deprecated"`), `order` (`release` newest first, `context` largest first, `cost` cheapest blended first) and `paginationOpts`. The index is chosen to keep the requested `order` (provider, then family, then global, for each order), and the remaining predicates are filtered during the paginated scan. A narrow filter over a wide index can return a short page, so keep paginating until `isDone`. A call reads at most 4,000 rows whatever `maximumRowsRead` says, and a supplied `endCursor` pins the end of the page so reactive pagination has no gaps or overlaps. Pagination inside the component uses `paginator` from `convex-helpers`, so React apps should call `models.list` through `usePaginatedQuery` from `convex-helpers/react`. The built-in `usePaginatedQuery` expects an app-level `.paginate()` query.

`models.cheapest` ranks by a blended price `(3 * input + output) / 4` per 1M tokens, a documented convention rather than your workload. It streams rows in blended-cost order (ties included), scans at most 4,000 and skips models with no price. Gateways may list the same model several times, so use `distinctCanonical: true`. Treat the result as an approximation ([ADR 0003](docs/adr/0003-cheapest-streams-a-bounded-index-range.md)).

`sync.status` reads no clock. `running` is `true` while a run's lease is recorded, and `leaseExpiresAt` is that lease's expiry. Compare `leaseExpiresAt` with your own clock to ignore a lease left by a run that died. `lastStatus` is `ok`, `not_modified`, `partial` or `error`. `partial` means the run skipped the removal pass (`removalSkipped: true`): `lastSyncedAt` and the counters keep the last completed sync's values, and the next run retries. Other fields: `state` (`never_synced`, `ok`, `error`), `lastStatus`, `lastError`, `lastCheckedAt`, `lastSyncedAt`, `source`, `durationMs` and the counters `providerCount`, `modelCount`, `added`, `updated`, `removed`, `priceChanges`, `skippedModels`, `removalSkipped`.

Pure exports: `estimateCost`, `usageFromAgent`, `resolveModel`, `providerCandidates`, `splitModelKey`, `DEFAULT_PROVIDER_ALIASES`, `isModelsDevError`, the validators `syncStatusValidator` and `syncSummaryValidator`, and the types `CostBreakdown`, `CostEstimate`, `CostModel`, `EstimateCostOptions`, `ListModelsArgs`, `EstimateCostArgs`, `ModelsDevErrorCode`, `ModelsDevErrorData`, `ModelsDevOptions`, `PriceFields`, `PriceTier`, `SyncStatus`, `SyncSummary` and `UsageInput`.

### Sync behaviour

1. The hourly cron (`sync.tick`) takes a lease in `syncState`, so overlapping runs exit.
2. It fetches the source with `If-None-Match` and a `User-Agent` identifying this package. A 304 ends the run.
3. Otherwise it hashes the body (SHA-256). An unchanged hash only refreshes the etag.
4. It parses, checks the structure, and aborts if the payload is smaller than the guards above. If the primary source fails, it tries the fallback.
5. It normalizes provider by provider, hashes each row, and upserts in chunks of about 300 rows. Only rows whose hash changed are written. A changed price or tier writes a `priceChanges` row. Models first seen after the first sync are recorded as `added`.
6. A removal pass deletes models and providers missing from the payload. If more than 20% of rows would go, deletion is skipped unless `force` is set, and the run is recorded as `partial` rather than `ok`, so it retries.
7. The etag and content hash are written last, so a failed run retries on the next tick.

The action keeps one copy of the data at a time: it downloads, hashes, parses, drops the text, then releases each provider's models after sending them. Models that fail validation are skipped and counted in `skippedModels`, and their stored rows are kept.

## Error codes

Errors are `ConvexError<{ code, message, retryable? }>`. Use `isModelsDevError(error)` to narrow one and read `error.data.code`.

| Code                            | Thrown by       | Meaning                                                                |
| ------------------------------- | --------------- | ---------------------------------------------------------------------- |
| `MODELS_DEV_INVALID_CONFIG`     | `config.update` | A numeric setting is not a finite number, or is below its minimum.     |
| `MODELS_DEV_INVALID_SOURCE_URL` | `config.update` | `sourceUrl` is not a valid URL, is not https, or contains credentials. |

Sync failures are not thrown. `sync.now` returns `{ status: "error", reason }` and the same reason is stored in `sync.status().lastError`. A catalog whose provider entry has no `models` object is rejected with the reason `MODELS_DEV_INVALID_CATALOG: ...` before any write, so no stored rows are removed.

## Testing

```ts
import { register } from "@operatornest/convex-models-dev/test";
import { convexTest } from "convex-test";

const t = convexTest(schema, modules);
register(t); // registers the component as "modelsDev"
```

Stub `fetch` with `vi.stubGlobal("fetch", ...)` to serve a small catalog, and lower the guards first with `config.update(ctx, { minProviders: 1, minModels: 1 })`. `example/convex/example.test.ts` shows the whole flow, and `src/test-helpers.ts` has a fake models.dev server. Never point tests at the real models.dev.

Test mode is not applicable: there are no credentials and no side effects outside the component's tables ([ADR 0002](docs/adr/0002-no-secrets-webhooks-or-test-mode.md)).

## Data retention

`models` and `providers` mirror upstream. `priceChanges` grows only when prices change, and rows older than `retentionDays` are deleted in batches of 500 (up to 20 batches, 10,000 rows, per tick) by the hourly run. `syncState` and `config` are singletons.

## Known limitations

- **Memory and time.** The 5.3 MB catalog is parsed in a default-runtime action (64 MiB limit). On 2026-10-04 a full sync of 8,393 models ran on the local Convex backend binary, which uses the same runtime as the cloud, in about 4.2 s with no memory or time limit errors. A profile on a cloud deployment is still welcome. Convex documents no fetch response size cap.
- **Tier boundaries are inferred.** `>` versus `>=` at a tier `size`, and the meaning of `N+1` sizes, come from models.dev's generator and provider docs, not from a stated rule.
- **Provider strings are best effort.** The AI SDK `provider` strings (`anthropic.messages`, `google.generative-ai`, `gateway`, ...) were not verified against each package. Pass `aliases` to fix mismatches.
- **Usage semantics vary.** Whether `inputTokens` includes cache tokens differs between providers and SDK versions. Use `inputIncludesCache: false` when yours does not.
- **It is an estimate.** Anthropic 1-hour cache writes cost more than the listed `cache_write`. Batch, flex, regional uplift, tool and search fees, and image tokens are not in the catalog. Prices are only as fresh as the last sync, so store `priceSnapshotAt`.
- **Mode and tier.** Mode pricing wins. models.dev publishes no tiers for modes, so above a base tier the estimate uses the per-field maximum of the mode price and the base tier price, which is a conservative guess, and says so in `assumptions`.
- **Data quirks.** Some upstream rows have `context: 0`, `output > context`, or `cache_read > input`. They are stored as given.
- **Out of 0.1.** `models.json` metadata (license, weights, benchmarks), a cost ledger, per-app markup and React hooks.
- **Upstream stability.** There is no documented rate limit or terms for models.dev. The sync uses conditional requests and a descriptive `User-Agent`. ETag stability across deploys was observed only briefly.

## Security

The upstream catalog is untrusted input. The component takes no credentials and stores none. It validates every row with hand-written guards, skips malformed models without deleting their stored rows, aborts on a payload that is too small, and skips a removal pass that would delete more than 20% of rows. `sourceUrl` must be https and can only be changed through `config.update`, which the component does not authenticate: guard the functions that call `config.update` and `sync.now` in your app. Error text stored in `syncState.lastError` contains the host and HTTP status, never headers or bodies.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/OperatorNest/convex-models-dev/security/advisories/new). See [SECURITY.md](SECURITY.md).

### Attribution

Catalog data comes from [models.dev](https://models.dev) (MIT, copyright (c) 2025 models.dev). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This package is not affiliated with models.dev.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md). The main checks are `pnpm check` and `pnpm smoke`.

## License

MIT. See [LICENSE](LICENSE).

Maintained by OperatorNest · Ravalika Korthiwada (@ravalikamaker)
