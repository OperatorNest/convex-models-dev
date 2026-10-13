# Working in this repository

Read `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/adr/` and the local Convex guidance in `example/convex/_generated/ai/guidelines.md` before changing behavior.

## Boundaries

- Package: `@operatornest/convex-models-dev`; component: `modelsDev`; error prefix: `MODELS_DEV_`.
- Shipped `src/` runs in Convex's default runtime. No `"use node"`, Node built-ins, `Buffer` or `process`.
- `convex` and `convex-helpers` are peers; no runtime dependencies. An official `@convex-dev/*` component dependency requires an ADR naming its work.
- No component environment variables, secrets or webhooks. Never store or log credentials.
- App wrappers authorize callers. Example maintenance functions are internal; public example queries require authentication.
- Treat catalogs as untrusted. Preserve download, normalization, size, removal and lease guards. Every catalog mutation clears cache validators before writing; only completed data syncs restore them.
- Throw `modelsDevError(code, providerStatus?)` with a fixed message. Add a code, message and README error row together.
- Every public function declares `args` and `returns`. `v.any()` is restricted to passthrough fields named `raw*`.
- Define shapes in `src/shared/validators.ts`; derive types with `Infer`. Use `schema.doc` and `paginationResultValidator` for documents and pages.
- Reads are indexed and bounded. Use `paginator` with `boundedPage`; no built-in component `.paginate()`, production `.collect()` or query clock reads.
- Index names list fields in order, joined by `_and_`; every index has a reader. Client arguments copy declared fields without caller-object spreads.
- No non-null assertions, `as unknown as`, TODOs or commented-out source. Comments state only constraints the code cannot express. Never weaken lint or coverage gates.

## Files

| Path                                                   | Responsibility                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `src/component/schema.ts`                              | Catalog, history, sync lease and settings tables.                   |
| `src/component/sync.ts`                                | Sync entrypoints, lease-fenced writes and retention.                |
| `src/component/syncCore.ts`                            | Bounded fetch, validation, byte-batched upsert and guarded removal. |
| `src/component/models.ts`, `providers.ts`, `config.ts` | Catalog queries and settings.                                       |
| `src/shared/`                                          | Validators, errors, bounds, normalization, cost and resolution.     |
| `src/client/index.ts`                                  | App wrapper and pure exports.                                       |
| `src/test.ts`, `src/import-meta.d.ts`                  | Published convex-test registration without Vite types.              |
| `src/test-helpers.ts`, `src/fixtures/`                 | Unpublished fetch stubs and fixtures.                               |
| `example/convex/`                                      | App wrappers and integration tests.                                 |
| `scripts/check-source.mjs`, `smoke.mjs`                | Source invariants and isolated local runtime journey.               |

## Generated output

Never edit `src/component/_generated/` or `example/convex/_generated/` by hand. Change inputs, run `pnpm build:codegen`, review generated diffs and include them with the source change. `dist/` is ignored build output. A fresh checkout needs `CONVEX_AGENT_MODE=anonymous pnpm exec convex init` before codegen; never configure a cloud target for local checks.

## Verification

Use Node 24 and pnpm 12.9.1 through mise. Keep repository configuration consistent with those versions. Read `.agents/skills/` when its contributor guidance applies.

Start with affected tests and formatting, then run the required gate:

| Change                              | Checks                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Component, schema or shared runtime | `pnpm build:codegen`, `pnpm test`, `pnpm typecheck`, `pnpm smoke`.               |
| Client or exports                   | `pnpm build`, `pnpm typecheck`, `pnpm knip`, affected client tests, `pnpm test`. |
| Tooling or repository rules         | `pnpm check`.                                                                    |
| Prose Markdown                      | `pnpm fmt:check`.                                                                |
| Executable docs                     | Formatting and affected example/client tests; smoke for runtime claims.          |

Tests stub fetch and call `relaxGuards` for small fixtures. Component tests use `componentTest`; shared test helpers belong in `src/test-helpers.ts`. Use `vi.setSystemTime` for clock-dependent assertions and restore timers after each test. Coverage floors may only hold or rise: 90% statements and 85% branches.

`pnpm smoke` installs a tarball in a disposable consumer app, runs strict TypeScript and Vitest, replaces source destinations there with a local fixture server, and checks real-runtime calls on an anonymous backend with isolated ports. It strips inherited deployment selectors and never calls live providers. Codegen and smoke use the shared local lock. Do not terminate another checkout's backend.

Keep changes scoped to this component and its example. Update an ADR when a contract changes. Report commands and exit codes; local smoke proves neither cloud execution nor live-provider behavior. Publishing, pushing, deploying and registry submissions require explicit authorization.
