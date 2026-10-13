The package is `@operatornest/convex-models-dev`, component name `modelsDev`.

## Scope

Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [ADRs](docs/adr/) before changing behavior. The [Concepts table](README.md#concepts) defines caller vocabulary. Keep changes within this component and its example.

## Runtime and security boundaries

- Shipped `src/` uses Convex's default runtime: no `"use node"`, Node built-ins, `Buffer` or `process`.
- `convex` and `convex-helpers` are peers; there are no runtime dependencies. Adding an official component dependency requires an ADR.
- There are no component environment variables, credentials, HTTP routes or test mode. Never store or log credentials.
- App wrappers authorize callers. Example maintenance functions are internal; public example queries require authentication.
- Treat catalog data as untrusted. Preserve download, normalization, storage-size, catalog-loss and lease guards.
- Catalog mutations clear cache validators before writing; only completed data syncs restore them.
- Throw `modelsDevError(code, details?)` with its fixed message. Add a code, message and README error row together.

## Query and validator patterns

- Every public function declares `args` and `returns`. Restrict `v.any()` to passthrough fields named `raw*`.
- Define shapes in `src/shared/validators.ts`; derive types with `Infer`. Use `schema.doc` and `paginationResultValidator` for documents and pages.
- Reads are indexed and bounded. Use `paginator` with `boundedPage`; no built-in component `.paginate()`, production `.collect()` or query clock reads.
- Index names list every field in order joined by `_and_`; every index has a reader.
- Client groups call only same-named component modules and copy declared argument fields explicitly.
- No non-null assertions, `as unknown as`, TODOs or commented-out source. Comments explain only invariants, bounds or external constraints; exported client methods and types have one TSDoc sentence.

## Generated files

Never edit `src/component/_generated/` or `example/convex/_generated/` by hand. Change inputs, run `pnpm build:codegen`, inspect generated diffs and include them with the source change. Ignore `example/convex/_generated/ai/` and `dist/`.

A fresh checkout needs `CONVEX_AGENT_MODE=anonymous pnpm exec convex init` before codegen. Never configure a cloud target for local checks. Codegen and smoke share a local lock; do not terminate another checkout's backend.

## Toolchain and verification

Use Node 24 and pnpm 12.9.1 through mise. Enable `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch`. Keep `exactOptionalPropertyTypes` disabled because imported `convex-helpers` TypeScript source fails it; recheck on each upgrade.

Start with affected tests and formatting, then run the required checks:

| Change                              | Checks                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Component, schema or shared runtime | `pnpm build:codegen`, `pnpm test`, `pnpm typecheck`, `pnpm smoke`               |
| Client or exports                   | `pnpm build`, `pnpm typecheck`, `pnpm knip`, affected client tests, `pnpm test` |
| Tooling or repository rules         | `pnpm check`                                                                    |
| Prose Markdown                      | `pnpm fmt:check`                                                                |
| Executable docs                     | Formatting, affected example/client tests and smoke for runtime claims          |

Tests stub fetch and call `relaxGuards` for small fixtures. Component tests use `componentTest`; shared helpers belong in `src/test-helpers.ts`. Use `vi.setSystemTime` for clock-dependent assertions and restore timers after each test. Coverage floors are at least 90% statements and 85% branches; never weaken gates.

Smoke installs a tarball in a disposable consumer, compiles strict TypeScript, runs Vitest and calls an anonymous local backend with fixture catalog endpoints and isolated ports. It removes inherited deployment selectors and never calls live catalog providers. Local smoke proves neither cloud execution nor live-provider behavior.

Update an ADR when a recorded design changes. Report commands and exit codes. Publishing, pushing, deploying and registry submissions require explicit authorization.
