---
name: release
description: Contributor guidance for release.
---

# Release

Read the release workflow, active changesets, package metadata and changelog. Verify consumer-visible changes and generated bindings, then run `pnpm check`, `pnpm smoke` and `pnpm audit --prod --audit-level high`. Inspect package contents. A maintainer versions changesets on a branch; the release workflow publishes unpublished versions after CI passes. Verify the published version, provenance and tag against npm gitHead. Publishing, tagging, pushing and merging require explicit authorization.
