# 0003. `models.cheapest` streams a bounded index range

## Context

Reads must be bounded by `.take`, `paginator` or index ranges. `cheapest` must skip rows
that fail capability filters and then collapse duplicates, so a fixed `.take(n)` window can end
before it finds enough matches, for example inside a long run of tied prices.

## Decision

`cheapest` iterates `by_cost_blended` lazily with `for await` (cost ascending, ties included)
and stops after the requested number of matches or `CHEAPEST_MAX_SCAN` (4,000) rows, whichever
comes first. Every read is an index range and the scan cap bounds the work.

## Consequences

- A very selective filter can return fewer rows than `limit` when the first 4,000 priced rows do
  not contain enough matches. The README documents `cheapest` as an approximation.
- The lint rule `no-await-in-loop` is off for `src/component`, so the stream needs no directive.
