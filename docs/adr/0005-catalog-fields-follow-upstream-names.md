# 0005: Catalog fields follow upstream names

Stored models keep the upstream catalog's shape where a flat name would be ambiguous. `limit` stores `{ context, input?, output }` verbatim. `providerOverride` stores a model's upstream `provider` object, so `provider` keeps its meaning of an AI SDK provider name in `models.resolve` and cost estimation. Sync status and summaries name the loaded catalog URL `sourceUrl`, the same word as the setting, and keep `source` for the `primary` or `fallback` diagnostic label.

`contextTokens` is a top-level copy of `limit.context` that backs the context-ordered indexes. Index names are `by_` plus their field names, and an index name cannot contain the dot of a nested field path.

`type` is stored verbatim because upstream adds model types without notice; `models.list` and `models.listCheapest` filter by an exact type, or by `null` for models without one, and filter nothing by default. An unknown `status` value is dropped and the model is kept, because a new upstream status would otherwise remove every model that carries it. Month-only `YYYY-MM` dates and a reasoning budget `min` of -1 are accepted because the upstream schema accepts them.
