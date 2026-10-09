import { paginator } from "convex-helpers/server/pagination";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { query, type QueryCtx } from "./_generated/server.js";
import schema from "./schema.js";
import { estimateCost } from "../shared/cost.js";
import { modalityMask } from "../shared/normalize.js";
import { providerCandidates, splitModelKey } from "../shared/resolve.js";
import { costEstimateValidator, usageValidator } from "../shared/validators.js";

const modelDoc = schema.doc("models");
const modalityList = v.array(v.string());
const MODALITY_NAMES = new Set(["text", "audio", "image", "video", "pdf"]);
const CHEAPEST_MAX_SCAN = 4000;
/** Most provider-prefix candidates `getByKey` will look up for one key. */
const MAX_KEY_PREFIXES = 8;
/** Most rows one `list` call reads, whatever `maximumRowsRead` asks for. */
const LIST_MAX_ROWS_READ = 4000;

function findModel(ctx: QueryCtx, providerId: string, modelId: string) {
  return ctx.db
    .query("models")
    .withIndex("by_provider_model", (q) => q.eq("providerId", providerId).eq("modelId", modelId))
    .first();
}

async function providerExists(ctx: QueryCtx, providerId: string) {
  const row = await ctx.db
    .query("providers")
    .withIndex("by_providerId", (q) => q.eq("providerId", providerId))
    .first();
  return row !== null;
}

async function findByKey(ctx: QueryCtx, key: string) {
  // Check each possible provider prefix against the table, then split at the first known one.
  const prefixes = new Set<string>();
  for (let i = 0; i < key.length && prefixes.size < MAX_KEY_PREFIXES; i++) {
    if (i > 0 && (key[i] === "/" || key[i] === ":")) prefixes.add(key.slice(0, i));
  }
  const checked = await Promise.all(
    [...prefixes].map(async (prefix) => ((await providerExists(ctx, prefix)) ? prefix : null)),
  );
  const known = new Set(checked.filter((prefix) => prefix !== null));
  const split = splitModelKey(key, (providerId) => known.has(providerId));
  return split ? findModel(ctx, split.providerId, split.modelId) : null;
}

async function resolveRow(
  ctx: QueryCtx,
  provider: string,
  model: string,
  aliases: Record<string, string> | undefined,
) {
  const rows = await Promise.all(
    providerCandidates(provider, aliases).map((providerId) => findModel(ctx, providerId, model)),
  );
  return rows.find((row) => row !== null) ?? null;
}

export const get = query({
  args: { providerId: v.string(), modelId: v.string() },
  returns: v.union(modelDoc, v.null()),
  handler: (ctx, { providerId, modelId }) => findModel(ctx, providerId, modelId),
});

export const getByKey = query({
  args: { key: v.string() },
  returns: v.union(modelDoc, v.null()),
  handler: (ctx, { key }) => findByKey(ctx, key),
});

export const resolve = query({
  args: {
    provider: v.string(),
    model: v.string(),
    aliases: v.optional(v.record(v.string(), v.string())),
  },
  returns: v.union(modelDoc, v.null()),
  handler: (ctx, { provider, model, aliases }) => resolveRow(ctx, provider, model, aliases),
});

function masks(names: string[] | undefined): number[] {
  return (names ?? [])
    .filter((name) => MODALITY_NAMES.has(name))
    .map((name) => modalityMask([name]));
}

export const list = query({
  args: {
    providerId: v.optional(v.string()),
    family: v.optional(v.string()),
    status: v.optional(v.string()),
    reasoning: v.optional(v.boolean()),
    toolCall: v.optional(v.boolean()),
    structuredOutput: v.optional(v.boolean()),
    openWeights: v.optional(v.boolean()),
    inputModalities: v.optional(modalityList),
    outputModalities: v.optional(modalityList),
    minContext: v.optional(v.number()),
    maxCostInput: v.optional(v.number()),
    includeDeprecated: v.optional(v.boolean()),
    order: v.optional(v.union(v.literal("release"), v.literal("context"), v.literal("cost"))),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(modelDoc),
  handler: async (ctx, args) => {
    const order = args.order ?? "release";
    const { providerId, family, minContext } = args;
    const table = paginator(ctx.db, schema).query("models");
    // Every branch keeps the requested order: release and context newest/largest
    // first, cost cheapest first. Other predicates are filtered during the scan.
    let indexed;
    if (order === "release") {
      indexed =
        providerId !== undefined
          ? table.withIndex("by_provider_release", (q) => q.eq("providerId", providerId))
          : family !== undefined
            ? table.withIndex("by_family_release", (q) => q.eq("family", family))
            : table.withIndex("by_release");
      indexed = indexed.order("desc");
    } else if (order === "context") {
      const floor = minContext ?? 0;
      indexed = (
        providerId !== undefined
          ? table.withIndex("by_provider_context", (q) =>
              q.eq("providerId", providerId).gte("contextLimit", floor),
            )
          : family !== undefined
            ? table.withIndex("by_family_context", (q) =>
                q.eq("family", family).gte("contextLimit", floor),
              )
            : table.withIndex("by_context", (q) => q.gte("contextLimit", floor))
      ).order("desc");
    } else {
      // gte 0 leaves out models with no price.
      indexed =
        providerId !== undefined
          ? table.withIndex("by_provider_cost", (q) =>
              q.eq("providerId", providerId).gte("costBlended", 0),
            )
          : family !== undefined
            ? table.withIndex("by_family_cost", (q) => q.eq("family", family).gte("costBlended", 0))
            : table.withIndex("by_cost_blended", (q) => q.gte("costBlended", 0));
    }

    const inputBits = masks(args.inputModalities);
    const outputBits = masks(args.outputModalities);
    const passes = (m: Doc<"models">) =>
      (args.providerId === undefined || m.providerId === args.providerId) &&
      (args.family === undefined || m.family === args.family) &&
      (args.status !== undefined
        ? m.status === args.status
        : args.includeDeprecated || m.status !== "deprecated") &&
      (args.reasoning === undefined || m.reasoning === args.reasoning) &&
      (args.toolCall === undefined || m.toolCall === args.toolCall) &&
      (args.structuredOutput === undefined || m.structuredOutput === args.structuredOutput) &&
      (args.openWeights === undefined || m.openWeights === args.openWeights) &&
      (args.minContext === undefined || m.contextLimit >= args.minContext) &&
      (args.maxCostInput === undefined ||
        (m.hasCost && m.costInput !== undefined && m.costInput <= args.maxCostInput)) &&
      inputBits.every((bit) => (m.inputMask & bit) === bit) &&
      outputBits.every((bit) => (m.outputMask & bit) === bit);

    // `paginator` has no `.filter()`, so predicates run on each fetched batch. The batch
    // size is the number of rows still needed, so a batch never overshoots and the
    // returned cursor is exact. Sparse filters may return a short page.
    const wanted = Math.max(1, Math.min(Math.floor(args.paginationOpts.numItems), 100));
    const maxRows = Math.max(
      1,
      Math.min(
        Math.floor(args.paginationOpts.maximumRowsRead ?? LIST_MAX_ROWS_READ),
        LIST_MAX_ROWS_READ,
      ),
    );
    // A pinned page (reactive pagination) ends at `endCursor`, so no gap or overlap appears
    // when rows change between reads. Otherwise the page ends after `wanted` matches.
    const endCursor = args.paginationOpts.endCursor ?? undefined;
    const page: Doc<"models">[] = [];
    let cursor = args.paginationOpts.cursor;
    let isDone = false;
    let scanned = 0;
    while (
      !isDone &&
      scanned < maxRows &&
      (endCursor !== undefined ? cursor !== endCursor : page.length < wanted)
    ) {
      const allowance = maxRows - scanned;
      // Batches depend on the previous cursor, so they run in order.
      const batch = await indexed.paginate({
        cursor,
        numItems: Math.max(1, Math.min(wanted - page.length, allowance)),
        maximumRowsRead: allowance,
        ...(endCursor !== undefined && { endCursor }),
      });
      scanned += batch.page.length;
      for (const m of batch.page) if (passes(m)) page.push(m);
      cursor = batch.continueCursor;
      isDone = batch.isDone;
    }
    return { page, isDone, continueCursor: cursor ?? "" };
  },
});

export const search = query({
  args: {
    query: v.string(),
    providerId: v.optional(v.string()),
    family: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(modelDoc),
  handler: async (ctx, { query: text, providerId, family, limit }) => {
    const term = text.trim().toLowerCase();
    if (!term) return [];
    return ctx.db
      .query("models")
      .withSearchIndex("search_name", (q) => {
        let builder = q.search("searchText", term);
        if (providerId !== undefined) builder = builder.eq("providerId", providerId);
        if (family !== undefined) builder = builder.eq("family", family);
        return builder;
      })
      .take(Math.max(1, Math.min(Math.floor(limit ?? 10), 50)));
  },
});

export const cheapest = query({
  args: {
    minContext: v.optional(v.number()),
    minOutput: v.optional(v.number()),
    reasoning: v.optional(v.boolean()),
    toolCall: v.optional(v.boolean()),
    structuredOutput: v.optional(v.boolean()),
    inputModalities: v.optional(modalityList),
    providerIds: v.optional(v.array(v.string())),
    excludeFree: v.optional(v.boolean()),
    excludeDeprecated: v.optional(v.boolean()),
    distinctCanonical: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(modelDoc),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 5), 20));
    const excludeDeprecated = args.excludeDeprecated ?? true;
    const required = masks(args.inputModalities).reduce((acc, bit) => acc | bit, 0);
    const providers = args.providerIds ? new Set(args.providerIds) : undefined;
    const matches = (m: Doc<"models">) =>
      (args.minContext === undefined || m.contextLimit >= args.minContext) &&
      (args.minOutput === undefined || m.outputLimit >= args.minOutput) &&
      (args.reasoning === undefined || m.reasoning === args.reasoning) &&
      (args.toolCall === undefined || m.toolCall === args.toolCall) &&
      (args.structuredOutput === undefined || m.structuredOutput === args.structuredOutput) &&
      (required === 0 || (m.inputMask & required) === required) &&
      (!providers || providers.has(m.providerId)) &&
      (!args.excludeFree || (m.costBlended ?? 0) > 0) &&
      (!excludeDeprecated || m.status !== "deprecated");

    const results: Doc<"models">[] = [];
    const canonical = new Set<string>();
    let scanned = 0;
    // Lazily streams `by_cost_blended` in order, so any run of ties is walked through.
    for await (const m of ctx.db
      .query("models")
      .withIndex("by_cost_blended", (q) => q.gte("costBlended", 0))) {
      if (++scanned > CHEAPEST_MAX_SCAN) break;
      if (!matches(m)) continue;
      if (args.distinctCanonical) {
        const key = m.canonicalModelId ?? `${m.providerId}/${m.modelId}`;
        if (canonical.has(key)) continue;
        canonical.add(key);
      }
      results.push(m);
      if (results.length >= limit) break;
    }
    return results;
  },
});

export const equivalents = query({
  args: { canonicalModelId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(modelDoc),
  handler: async (ctx, { canonicalModelId, limit }) => {
    const rows = await ctx.db
      .query("models")
      .withIndex("by_canonical", (q) => q.eq("canonicalModelId", canonicalModelId))
      .take(Math.max(1, Math.min(Math.floor(limit ?? 200), 200)));
    return rows.toSorted(
      (a, b) =>
        (a.costBlended ?? Number.POSITIVE_INFINITY) - (b.costBlended ?? Number.POSITIVE_INFINITY),
    );
  },
});

export const priceHistory = query({
  args: { providerId: v.string(), modelId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(schema.doc("priceChanges")),
  handler: (ctx, { providerId, modelId, limit }) =>
    ctx.db
      .query("priceChanges")
      .withIndex("by_model_at", (q) => q.eq("providerId", providerId).eq("modelId", modelId))
      .order("desc")
      .take(Math.max(1, Math.min(Math.floor(limit ?? 50), 200))),
});

export const estimate = query({
  args: {
    provider: v.string(),
    model: v.string(),
    usage: usageValidator,
    mode: v.optional(v.string()),
    inputIncludesCache: v.optional(v.boolean()),
    aliases: v.optional(v.record(v.string(), v.string())),
  },
  returns: costEstimateValidator,
  handler: async (ctx, args) => {
    const row = await resolveRow(ctx, args.provider, args.model, args.aliases);
    if (!row) return { known: false as const };
    return estimateCost(row, args.usage, {
      ...(args.mode !== undefined && { mode: args.mode }),
      ...(args.inputIncludesCache !== undefined && {
        inputIncludesCache: args.inputIncludesCache,
      }),
    });
  },
});
