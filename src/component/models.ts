import { paginator } from "convex-helpers/server/pagination";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { query, type QueryCtx } from "./_generated/server.js";
import schema from "./schema.js";
import { boundedLimit, boundedPage, finiteBounds } from "../shared/bounds.js";
import { modelsDevError } from "../shared/errors.js";
import { estimateCost, validateUsage } from "../shared/cost.js";
import { modalityMask } from "../shared/normalize.js";
import { providerCandidates, splitModelKey } from "../shared/resolve.js";
import { costEstimateValidator, usageValidator } from "../shared/validators.js";

const modelDoc = schema.doc("models");
const modalityList = v.array(v.string());
const MODALITY_NAMES = new Set(["text", "audio", "image", "video", "pdf"]);
const CHEAPEST_MAX_SCAN = 4000;

const MAX_KEY_PREFIXES = 8;

function findModel(ctx: QueryCtx, providerId: string, modelId: string) {
  return ctx.db
    .query("models")
    .withIndex("by_providerId_and_modelId", (q) =>
      q.eq("providerId", providerId).eq("modelId", modelId),
    )
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
  if (names?.some((name) => !MODALITY_NAMES.has(name)))
    throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
  return (names ?? []).map((name) => modalityMask([name]));
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
    finiteBounds(args.minContext, args.maxCostInput);
    const pagination = boundedPage(args.paginationOpts);
    const order = args.order ?? "release";
    const { providerId, family, minContext } = args;
    const table = paginator(ctx.db, schema).query("models");

    let indexed;
    if (order === "release") {
      indexed =
        providerId !== undefined
          ? table.withIndex("by_providerId_and_releaseDate", (q) => q.eq("providerId", providerId))
          : family !== undefined
            ? table.withIndex("by_family_and_releaseDate", (q) => q.eq("family", family))
            : table.withIndex("by_releaseDate");
      indexed = indexed.order("desc");
    } else if (order === "context") {
      const floor = minContext ?? 0;
      indexed = (
        providerId !== undefined
          ? table.withIndex("by_providerId_and_contextLimit", (q) =>
              q.eq("providerId", providerId).gte("contextLimit", floor),
            )
          : family !== undefined
            ? table.withIndex("by_family_and_contextLimit", (q) =>
                q.eq("family", family).gte("contextLimit", floor),
              )
            : table.withIndex("by_contextLimit", (q) => q.gte("contextLimit", floor))
      ).order("desc");
    } else {
      indexed =
        providerId !== undefined
          ? table.withIndex("by_providerId_and_costBlended", (q) =>
              q.eq("providerId", providerId).gte("costBlended", 0),
            )
          : family !== undefined
            ? table.withIndex("by_family_and_costBlended", (q) =>
                q.eq("family", family).gte("costBlended", 0),
              )
            : table.withIndex("by_costBlended", (q) => q.gte("costBlended", 0));
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

    return indexed.filterWith(async (m) => passes(m)).paginate(pagination);
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
    const count = boundedLimit(limit, 10, 50);
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
      .take(count);
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
  returns: v.object({ models: v.array(modelDoc), isComplete: v.boolean() }),
  handler: async (ctx, args) => {
    finiteBounds(args.minContext, args.minOutput);
    const limit = boundedLimit(args.limit, 5, 20);
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

    const ordered = providers
      ? [...providers].map((providerId) =>
          ctx.db
            .query("models")
            .withIndex("by_providerId_and_costBlended", (q) =>
              q.eq("providerId", providerId).gte("costBlended", 0),
            ),
        )
      : [ctx.db.query("models").withIndex("by_costBlended", (q) => q.gte("costBlended", 0))];
    const streams = ordered.map((range) => range[Symbol.asyncIterator]());
    const heads: (Doc<"models"> | undefined)[] = [];
    let bounded = false;
    const advance = async (index: number) => {
      if (scanned >= CHEAPEST_MAX_SCAN) {
        heads[index] = undefined;
        return false;
      }
      const next = await streams[index]?.next();
      heads[index] = next && !next.done ? next.value : undefined;
      if (heads[index]) scanned++;
      return true;
    };
    try {
      for (let i = 0; i < streams.length; i++) {
        bounded = !(await advance(i));
        if (bounded) break;
      }
      while (!bounded && results.length < limit) {
        let selected = -1;
        for (let i = 0; i < heads.length; i++) {
          const candidate = heads[i];
          const current = heads[selected];
          if (
            candidate &&
            (!current ||
              (candidate.costBlended ?? 0) < (current.costBlended ?? 0) ||
              (candidate.costBlended === current.costBlended &&
                candidate._creationTime < current._creationTime))
          )
            selected = i;
        }
        const m = heads[selected];
        if (!m) break;
        if (matches(m)) {
          const key = m.canonicalModelId ?? JSON.stringify([m.providerId, m.modelId]);
          if (!args.distinctCanonical || !canonical.has(key)) {
            canonical.add(key);
            results.push(m);
          }
        }
        if (results.length < limit) bounded = !(await advance(selected));
      }
    } finally {
      for (const stream of streams) await stream.return?.();
    }
    return { models: results, isComplete: !bounded || results.length >= limit };
  },
});

export const equivalents = query({
  args: { canonicalModelId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(modelDoc),
  handler: async (ctx, { canonicalModelId, limit }) => {
    return ctx.db
      .query("models")
      .withIndex("by_canonicalModelId_and_hasCost_and_costOrder", (q) =>
        q.eq("canonicalModelId", canonicalModelId),
      )
      .order("desc")
      .take(boundedLimit(limit, 200, 200));
  },
});

export const priceHistory = query({
  args: { providerId: v.string(), modelId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(schema.doc("priceChanges")),
  handler: (ctx, { providerId, modelId, limit }) =>
    ctx.db
      .query("priceChanges")
      .withIndex("by_providerId_and_modelId_and_at", (q) =>
        q.eq("providerId", providerId).eq("modelId", modelId),
      )
      .order("desc")
      .take(boundedLimit(limit, 50, 200)),
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
    validateUsage(args.usage);
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
