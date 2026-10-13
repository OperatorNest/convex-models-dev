# 0003. Bounded cheapest scan

`models.cheapest` reads `by_costBlended` in ascending order when no providers are selected. With `providerIds`, it merges deduplicated `by_providerId_and_costBlended` ranges in ascending blended cost and creation time. All ranges share a 4000-row scan bound. It filters capabilities and collapses canonical duplicates during iteration.

The result is `{ models, isComplete }`. `isComplete` is false whenever the scan bound stops a read before the requested matches. Exhausted ranges produce a complete short result; reaching the requested matches produces a complete result. Callers needing exhaustive results use paginated listing.
