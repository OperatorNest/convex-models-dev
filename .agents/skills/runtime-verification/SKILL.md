---
name: runtime-verification
description: Contributor guidance for runtime verification.
---

# Runtime verification

Read `AGENTS.md` and package scripts. Run affected tests before the required gate. Regenerate component and example bindings with `pnpm build:codegen`; never edit generated output. Run `pnpm smoke` for component, schema or shared runtime changes. Smoke uses a disposable anonymous local backend and a fixture server, without live provider requests. Respect the shared lock and never terminate another checkout's backend. Report commands, exit codes and verification environment.
