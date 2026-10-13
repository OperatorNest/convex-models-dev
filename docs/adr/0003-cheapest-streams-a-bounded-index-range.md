# 0003: Bounded cheapest scan

`models.listCheapest` reads `by_costBlended` in ascending order when no providers are selected. With `modelsDevProviderIds`, it merges deduplicated `by_modelsDevProviderId_and_costBlended` ranges, at most 64 per query, in ascending blended cost and creation time. All ranges share a 4000-row scan bound. It filters capabilities and collapses canonical duplicates during iteration.

The result is `{ models, isComplete }`. `isComplete` is false whenever the scan bound stops a read before the requested matches. Exhausted ranges produce a complete short result; reaching the requested matches produces a complete result. Callers needing exhaustive results use paginated listing.
