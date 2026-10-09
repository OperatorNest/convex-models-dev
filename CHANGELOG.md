# @operatornest/convex-models-dev

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
