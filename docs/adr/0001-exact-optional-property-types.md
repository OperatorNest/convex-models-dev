# 0001. `exactOptionalPropertyTypes` stays off

## Context

`exactOptionalPropertyTypes` checks omitted optional properties but requires compatible upstream sources. This package imports `paginator` from
`convex-helpers/server/pagination`, which pulls in `convex-helpers/server/stream.ts`.
That file ships as TypeScript source, so `skipLibCheck` does not silence it.

With the flag on, `tsc -p tsconfig.build.json` reports exactly four errors, all inside
`node_modules/convex-helpers@0.1.126/server/stream.ts`, and none in this repository:

```
server/stream.ts(445,5): error TS2375: Type '{ page: T[]; isDone: boolean; continueCursor: string;
  pageStatus: "SplitRecommended" | "SplitRequired" | undefined; splitCursor: string | undefined; }'
  is not assignable to type 'PaginationResult<T>' with 'exactOptionalPropertyTypes: true'.
server/stream.ts(670,3): error TS2416: Property 'reflect' in type 'StreamQueryInitializer<Schema, T>'
  is not assignable to the same property in base type 'StreamableQuery<Schema, T, "by_creation_time">'.
server/stream.ts(720,3): error TS2416: Property 'reflect' in type 'StreamQuery<Schema, T, IndexName>'
  is not assignable to the same property in base type 'StreamableQuery<Schema, T, IndexName>'.
server/stream.ts(754,3): error TS2416: Property 'reflect' in type 'OrderedStreamQuery<Schema, T, IndexName>'
  is not assignable to the same property in base type 'StreamableQuery<Schema, T, IndexName>'.
```

## Decision

Leave `exactOptionalPropertyTypes` off in `tsconfig.json`. Never patch `node_modules`.
The code in `src/` and `example/` was still written to be clean under the flag: optional
properties are omitted rather than set to `undefined`, built with conditional spreads. The
four upstream errors above were the only ones left when the flag was tried on the build
project.

## Consequences

- The flag is not enforced for regressions. A contributor can reproduce the check with
  `tsc -p tsconfig.build.json --noEmit --exactOptionalPropertyTypes` and should see only the
  four errors above.
- Revisit when `convex-helpers` ships a release that compiles under the flag.
