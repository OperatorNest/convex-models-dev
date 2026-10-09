# Contributing

This component mirrors the public [models.dev](https://models.dev) catalog into a Convex deployment and prices token usage from it. Before proposing a public API change, read [README](README.md) and the ADRs in [docs/adr/](docs/adr/). Keep changes focused on the catalog sync, the queries over it, the cost estimator and the Convex component boundary.

## Setup

Use Node 26 and pnpm 12.9.1 through mise. Consumers need Node.js 22.19 or newer. Run `mise trust && mise install` and `mise exec -- pnpm install --frozen-lockfile`.

In a fresh checkout, create an anonymous local Convex deployment and generate the component and example APIs:

```sh
CONVEX_AGENT_MODE=anonymous pnpm exec convex init
pnpm build:codegen
```

Codegen runs component codegen, builds the package so the example can resolve its dist config export, and runs example codegen against the local backend. It does not configure a cloud deployment or require a login.

## What to know about this component

- It has no secrets, no env vars and no webhooks, so there is nothing to configure and no signature to verify ([ADR 0002](docs/adr/0002-no-secrets-webhooks-or-test-mode.md)).
- The trust boundary is the upstream catalog. Treat `api.json` as untrusted: validate every row, skip bad models without deleting stored rows, and keep the size guard (`minProviders`, `minModels`) and the 20% removal guard.
- Sync runs hold a lease and every write carries the run id. A change to the sync path must keep writes lease-fenced and must write the etag last.
- Tests never call the real models.dev. They use the fake server in `src/test-helpers.ts` and the 21-model fixture in `src/fixtures/`. Only `pnpm smoke` touches the public API.
- Public component functions need `args` and `returns` validators. Reads stay bounded and go through indexes. Generated files change only through code generation.

## Reporting a bug

For a bug report, provide the package, Convex, and Node.js versions, runtime, operation, a minimal reproduction, expected result, and actual result. For catalog or pricing issues, include the provider and model identifiers and relevant public catalog values. Do not include credentials, access tokens, private prompts, customer data, or unredacted logs. Security reports go through [private vulnerability reporting](https://github.com/OperatorNest/convex-models-dev/security/advisories/new).

Follow the [OperatorNest Code of Conduct](https://github.com/OperatorNest/.github/blob/main/CODE_OF_CONDUCT.md) and [support guidance](https://github.com/OperatorNest/.github/blob/main/SUPPORT.md).

## Changes

Describe the user-visible behavior and update the relevant example, README table or ADR. Add a changeset (`pnpm changeset`) for a user-facing change. Run the checks for your change as listed in [AGENTS.md](AGENTS.md). The full local check is:

```sh
pnpm check
pnpm smoke
```

Never add real credentials or customer data to tests or examples. This component needs none.

## Releasing

1. Add a changeset to each user-facing PR (`pnpm changeset`).
2. To cut a release, a maintainer runs `pnpm changeset version` on a branch. That consumes the changesets, bumps `package.json` and updates `CHANGELOG.md`. Merge it through a PR.
3. On `main`, the Release workflow runs CI and the smoke test on the same commit. If the `package.json` version is not yet on npm, it publishes through npm trusted publishing (no tokens) and pushes a `v<version>` tag.

The first version of each package is published manually by a maintainer, before trusted publishing can be configured for it. Publishing, pushing, deploying and registry submissions require explicit authorization.
