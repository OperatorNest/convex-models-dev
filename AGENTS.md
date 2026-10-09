# Working in this repository

## Scope

Read `README.md`, `CONTRIBUTING.md`, and the ADRs in `docs/adr/` for supported behavior and decisions.

Read `example/convex/_generated/ai/guidelines.md` for official Convex API guidance. The runtime and dependency rules below apply to this package.

`src/import-meta.d.ts` provides the `import.meta.glob` type used by the test harness.

The package is `@operatornest/convex-models-dev` and its Convex component name is `modelsDev` (error prefix `MODELS_DEV_`). It mirrors the [models.dev](https://models.dev) catalog into component tables, serves queries over it and ships a pure cost estimator. It has no runtime dependencies, declares no env vars, has no webhooks and owns its hourly cron.

| Path                         | Responsibility                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/component/schema.ts`    | Tables `providers`, `models`, `syncState` (singleton and run lease), `priceChanges`, `config` (singleton).              |
| `src/component/sync.ts`      | `status`, `syncNow`, internal `tick` (cron), lease, upsert, removal and `finish` mutations, price-history cleanup.      |
| `src/component/syncCore.ts`  | `runSync`: conditional fetch, hash, parse, size guard, chunked upsert, removal pass, finish.                            |
| `src/component/models.ts`    | `get`, `getByKey`, `resolve`, `list`, `search`, `cheapest`, `equivalents`, `priceHistory`, `estimate`.                  |
| `src/component/providers.ts` | `list`, `get`.                                                                                                          |
| `src/component/config.ts`    | `get`, `configure` (settings and defaults), internal `getEffective`.                                                    |
| `src/component/crons.ts`     | Hourly `crons.interval` calling `internal.sync.tick`.                                                                   |
| `src/shared/`                | Pure code: `validators.ts` (every shape), `errors.ts`, `cost.ts`, `resolve.ts`, `normalize.ts`, `hash.ts`, `guards.ts`. |
| `src/client/index.ts`        | `ModelsDev` class (`models`, `providers`, `sync`, `config` groups), `isModelsDevError`, pure exports and types.         |
| `src/fixtures/`              | Real 21-model slice of `api.json`. Tests only, excluded from the build and from npm.                                    |
| `src/test.ts`                | `register(t)` for consumers using `convex-test`. `src/test-helpers.ts` is the unpublished test harness.                 |
| `example/convex/`            | Minimal app using the client, and its end-to-end tests.                                                                 |
| `scripts/`                   | `with-local-lock.mjs` (shared, byte-identical) and `smoke.mjs`.                                                         |

Sync in short: `begin` takes a lease and applies the interval floor and the `enabled` flag. `runSync` fetches with `If-None-Match`, falls back to `models.opencode.ai`, and ends on a 304 or an unchanged body hash. Otherwise it parses once, checks `minProviders` and `minModels`, normalizes provider by provider, upserts about 300 rows per mutation, compares per-row `contentHash` and writes `priceChanges` for price or tier diffs. A removal pass skips deletion if more than 20% of rows would go, unless `force`. `finish` writes `syncState` and the etag last, only if the lease still matches. Every write carries the run id and is rejected with `leaseLost` after a takeover.

Read the contributor guides in `.agents/skills/` when relevant to the change.

## Runtime and security boundaries

- Shipped code runs in Convex's default runtime. No `"use node"`, no `node:*` or bare Node built-ins, no `Buffer`, no `process` in authored `src/` files.
- `convex` and `convex-helpers` are peers. There are no runtime dependencies. Add one only if it is an official `@convex-dev/*` component that does real work, and document why it is required in an ADR.
- The component needs no secrets and declares no env vars ([ADR 0002](docs/adr/0002-no-secrets-webhooks-or-test-mode.md)). Never log or store credentials.
- The upstream catalog is untrusted. Validate with the guards in `src/shared/normalize.ts`, skip malformed models without deleting their stored rows, and keep the size and removal guards.
- `configure` accepts only https URLs without credentials and a minimum interval of 15 minutes. The component does not authenticate callers.
- Throw only `modelsDevError(code, message)` from `src/shared/errors.ts`. Add new codes to `MODELS_DEV_ERROR_CODES` and to the README table.
- Every public function has `args` and `returns`. No `v.any()` except passthrough fields named `raw*`.
- No `!` assertions, no `as unknown as`, no TODOs, no commented-out code in authored source; generated bindings are exempt from authored-source style rules. Suppressions are next-line only with a `-- reason`, and `--report-unused-disable-directives` rejects stale ones.

Bad: replace stored models after a malformed or tiny upstream response. Good: use the normalization, size, lease, and removal guards before a run can finish. Treat upstream catalog data as untrusted even when its URL is configured.

## Query and validator patterns

Keep reads bounded and filter through indexes. Never call built-in `.paginate()` inside the component; use `paginator` from `convex-helpers`. Never call `Date.now()` in a query.

```ts
const recent = await ctx.db
  .query("priceChanges")
  .withIndex("by_model_at", (q) => q.eq("providerId", providerId).eq("modelId", modelId))
  .order("desc")
  .take(50);
```

Use `schema.doc` for documents and `paginationResultValidator` for pages. Define each shape once in `src/shared/validators.ts` and derive the type with `Infer`:

```ts
export const get = query({
  args: { providerId: v.string(), modelId: v.string() },
  returns: v.union(schema.doc("models"), v.null()),
  handler: (ctx, args) => findModel(ctx, args.providerId, args.modelId),
});

export const providerKeysPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: paginationResultValidator(v.object({ id: v.id("providers"), providerId: v.string() })),
  handler: async (ctx, { cursor, numItems }) => {
    const result = await paginator(ctx.db, schema)
      .query("providers")
      .withIndex("by_providerId")
      .paginate({ cursor, numItems });
    return {
      page: result.page.map((p) => ({ id: p._id, providerId: p.providerId })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
```

Every index must be read by a query. Indexes today: `models` has `by_provider_model`, `by_canonical`, `by_provider_release`, `by_family_release`, `by_release`, `by_context`, `by_provider_context`, `by_family_context`, `by_provider_cost`, `by_family_cost`, `by_cost_blended` and the `search_name` search index; `providers` has `by_providerId`; `priceChanges` has `by_model_at` and `by_at`.

## Generated files

The `src/component/_generated/` and `example/convex/_generated/` bindings are generated output, excluded from authored-source lint rules. Edit their schema/function inputs, regenerate, review the diff, and commit changed tracked generated output with the source change. `dist/` remains ignored build output.

Never hand-edit `src/component/_generated/` or `example/convex/_generated/`. Regenerate with `pnpm build:codegen`, which runs component codegen, `pnpm build` and example codegen under the shared local lock. In a fresh checkout it needs an anonymous local deployment first: `CONVEX_AGENT_MODE=anonymous pnpm exec convex init`. It never signs in. If generated types are stale, regenerate; do not patch output to pass a typecheck.

## Environment and test behavior

There are no component env vars and no test mode ([ADR 0002](docs/adr/0002-no-secrets-webhooks-or-test-mode.md)). Tests stub `fetch` with `catalogServer` from `src/test-helpers.ts`, which honours `If-None-Match`, and never call real endpoints. The fixture is far below the default 50 provider and 1,000 model guards, so tests call `relaxGuards(t)` first. One test keeps the defaults to prove the guard aborts.

Component tests sit next to the modules and use `componentTest()`. `src/client/index.test.ts` calls every public client method. Use `vi.setSystemTime` instead of real-clock margins and restore timers in `afterEach`. Coverage thresholds are 90% statements and 85% branches on `src/**`. Shared helpers live in `src/test-helpers.ts`, never in a `*.test.ts` file.

## Toolchain

Node 26 and pnpm 12.9.1 are pinned in `.mise.toml` and `packageManager`; consumers need Node 22.19 or newer. TypeScript 7 native (`@typescript/native`) builds and typechecks, with TypeScript 6 installed alongside as in the official template. `exactOptionalPropertyTypes` is off because of upstream sources ([ADR 0001](docs/adr/0001-exact-optional-property-types.md)). Lint is type-aware oxlint with the Convex plugin, format is oxfmt, and `knip` checks unused code.

Maintain the tracked toolchain and repository-local configuration in `pnpm-workspace.yaml`, `.mise.toml`, `.editorconfig`, `.oxlintrc.json`, `.oxfmtrc.json`, `knip.json`, the workflows, and `scripts/with-local-lock.mjs`. Keep these files consistent with this package’s runtime and contributor requirements. Run `pnpm check` after tooling or configuration changes, and document justified exceptions in an ADR.

## Verification by change type

Start with affected tests and formatting, then run the required gate. `pnpm build:codegen` and `pnpm smoke` start or use the anonymous local backend under the shared lock; they cost more than `pnpm test` or `pnpm fmt:check`. Do not claim live-provider or browser verification from this local smoke run.

| Change                                                 | Required verification                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Component functions, schema or shared runtime behavior | `pnpm build:codegen`, `pnpm test`, `pnpm typecheck`, `pnpm smoke`.                            |
| Client behavior or exported package surface            | `pnpm build`, `pnpm typecheck`, `pnpm knip`, affected client tests, `pnpm test`.              |
| Tooling, configuration or repository-wide rules        | `pnpm check` (format, build, lint, typecheck, knip, tests).                                   |
| Prose-only Markdown                                    | `pnpm fmt:check`.                                                                             |
| Executable docs or API claims                          | `pnpm fmt:check`, affected example/client tests; `pnpm smoke` if runtime behavior is claimed. |

`pnpm smoke` builds the package, starts `convex dev` on an anonymous local deployment (created on demand, no login), syncs the live models.dev catalog through the example app and asserts on sync state, pagination, lookup, cost and error codes. convex-test does not enforce every runtime rule (it allowed `.paginate()` in a component, which the real runtime rejects), so run it for component changes. Ports come from `.env.local`. It takes the shared lock from `scripts/with-local-lock.mjs`, and CI runs it in the `smoke` job.

Coverage is a ratchet: the thresholds in `vitest.config.js` may hold or rise, never fall. `pnpm test` enforces the current floor; review threshold changes against the prior commit and add meaningful tests when coverage drops.

## Contribution boundaries

Keep changes scoped to the component and its example. Add an ADR when a change needs an exception to the contract, and update the relevant ADR when a decision changes. Report the exact checks run and their results. Publishing, pushing, deploying and registry submissions require explicit maintainer authorization.
