# Contributing

Read [README](README.md), [AGENTS.md](AGENTS.md) and the [ADRs](docs/adr/). Keep changes within the catalog sync, queries, estimator and example app.

## Setup and checks

Use Node 24 and pnpm 12.9.1 through mise:

```sh
mise trust && mise install
mise exec -- pnpm install --frozen-lockfile
CONVEX_AGENT_MODE=anonymous mise exec -- pnpm exec convex init
mise exec -- pnpm build:codegen
mise exec -- pnpm check
mise exec -- pnpm smoke
```

Initialize only an anonymous local deployment for codegen. Smoke creates a disposable anonymous backend and serves a local fixture; neither tests nor smoke call live catalog providers. It removes inherited deployment selectors. `convex-test` accepts some calls the real runtime rejects, so run smoke for component, schema and shared runtime changes.

## Change requirements

- Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`); a breaking change adds `!` after the type.
- Until 1.0.0, a breaking change ships without compatibility code, deprecation periods or data
  migrations; its changeset is a `minor` bump that states what breaks.

Update affected examples, README claims and ADR contracts. Add a changeset for consumer-visible changes. Keep reads bounded, indexed and lease-fenced writes intact; use fixed package errors. Regenerate bindings from inputs and include their diffs. Never include credentials or private prompts in fixtures or logs. Run the checks listed in AGENTS.md and report their exit codes.

## Reports and releases

Bug reports include package, Convex and Node versions, deployment type, operation, provider/model IDs when relevant, minimal reproduction, expected result and actual result. Remove credentials, private prompts, usage data and customer data. Report vulnerabilities [privately](https://github.com/OperatorNest/convex-models-dev/security/advisories/new).

Follow the [Code of Conduct](https://github.com/OperatorNest/.github/blob/main/CODE_OF_CONDUCT.md) and [support guidance](https://github.com/OperatorNest/.github/blob/main/SUPPORT.md).

A maintainer runs `pnpm changeset version` on a branch and merges the version PR. On `main`, the Release workflow publishes unpublished package versions after CI and smoke pass, then tags the published `gitHead`. Publishing, pushing, deploying and registry submissions require explicit authorization.
