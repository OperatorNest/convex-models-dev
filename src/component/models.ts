import { paginator } from "convex-helpers/server/pagination";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { query, type QueryCtx } from "./_generated/server.js";
import schema from "./schema.js";
import { boundedLimit, boundedPage, finiteBounds } from "../shared/bounds.js";
import { modelsDevError } from "../shared/errors.js";
import { estimateCost as estimateModelCost, validateUsage } from "../shared/cost.js";
import { modalityMask } from "../shared/normalize.js";
import { listProviderCandidates, splitModelKey } from "../shared/resolve.js";
import {
  costEstimateValidator,
  usageValidator,
  modelStatusValidator,
  inputTokenScopeValidator,
} from "../shared/validators.js";

const modelDoc = schema.doc("models");
const modalityList = v.array(v.string());
const MODALITY_NAMES = new Set(["text", "audio", "image", "video", "pdf"]);
const CHEAPEST_MAX_SCAN = 4000;

const MAX_KEY_PREFIXES = 8;

function findModel(ctx: QueryCtx, modelsDevProviderId: string, modelsDevModelId: string) {
  return ctx.db
    .query("models")
    .withIndex("by_modelsDevProviderId_and_modelsDevModelId", (q) =>
      q.eq("modelsDevProviderId", modelsDevProviderId).eq("modelsDevModelId", modelsDevModelId),
    )
    .first();
}

async function providerExists(ctx: QueryCtx, modelsDevProviderId: string) {
  const row = await ctx.db
    .query("providers")
    .withIndex("by_modelsDevProviderId", (q) => q.eq("modelsDevProviderId", modelsDevProviderId))
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
  const split = splitModelKey(key, (modelsDevProviderId) => known.has(modelsDevProviderId));
  return split ? findModel(ctx, split.modelsDevProviderId, split.modelsDevModelId) : null;
}

async function resolveRow(
  ctx: QueryCtx,
  provider: string,
  model: string,
  aliases: Record<string, string> | undefined,
) {
  const rows = await Promise.all(
    listProviderCandidates(provider, aliases).map((modelsDevProviderId) =>
      findModel(ctx, modelsDevProviderId, model),
    ),
  );
  return rows.find((row) => row !== null) ?? null;
}

export const get = query({
  args: { modelsDevProviderId: v.string(), modelsDevModelId: v.string() },
  returns: v.union(modelDoc, v.null()),
  handler: (ctx, { modelsDevProviderId, modelsDevModelId }) =>
    findModel(ctx, modelsDevProviderId, modelsDevModelId),
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
    modelsDevProviderId: v.optional(v.string()),
    family: v.optional(v.string()),
    status: v.optional(modelStatusValidator),
    reasoning: v.optional(v.boolean()),
    toolCall: v.optional(v.boolean()),
    structuredOutput: v.optional(v.boolean()),
    openWeights: v.optional(v.boolean()),
    inputModalities: v.optional(modalityList),
    outputModalities: v.optional(modalityList),
    minContextTokens: v.optional(v.number()),
    maxCostInput: v.optional(v.number()),
    includeDeprecated: v.optional(v.boolean()),
    order: v.optional(v.union(v.literal("release"), v.literal("context"), v.literal("cost"))),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(modelDoc),
  handler: async (ctx, args) => {
    finiteBounds(args.minContextTokens, args.maxCostInput);
    const pagination = boundedPage(args.paginationOpts);
    const order = args.order ?? "release";
    const { modelsDevProviderId, family, minContextTokens } = args;
    const table = paginator(ctx.db, schema).query("models");

    let indexed;
    if (order === "release") {
      indexed =
        modelsDevProviderId !== undefined
          ? table.withIndex("by_modelsDevProviderId_and_releaseDate", (q) =>
              q.eq("modelsDevProviderId", modelsDevProviderId),
            )
          : family !== undefined
            ? table.withIndex("by_family_and_releaseDate", (q) => q.eq("family", family))
            : table.withIndex("by_releaseDate");
      indexed = indexed.order("desc");
    } else if (order === "context") {
      const floor = minContextTokens ?? 0;
      indexed = (
        modelsDevProviderId !== undefined
          ? table.withIndex("by_modelsDevProviderId_and_context", (q) =>
              q.eq("modelsDevProviderId", modelsDevProviderId).gte("context", floor),
            )
          : family !== undefined
            ? table.withIndex("by_family_and_context", (q) =>
                q.eq("family", family).gte("context", floor),
              )
            : table.withIndex("by_context", (q) => q.gte("context", floor))
      ).order("desc");
    } else {
      indexed =
        modelsDevProviderId !== undefined
          ? table.withIndex("by_modelsDevProviderId_and_costBlended", (q) =>
              q.eq("modelsDevProviderId", modelsDevProviderId).gte("costBlended", 0),
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
      (args.modelsDevProviderId === undefined ||
        m.modelsDevProviderId === args.modelsDevProviderId) &&
      (args.family === undefined || m.family === args.family) &&
      (args.status !== undefined
        ? m.status === args.status
        : args.includeDeprecated || m.status !== "deprecated") &&
      (args.reasoning === undefined || m.reasoning === args.reasoning) &&
      (args.toolCall === undefined || m.toolCall === args.toolCall) &&
      (args.structuredOutput === undefined || m.structuredOutput === args.structuredOutput) &&
      (args.openWeights === undefined || m.openWeights === args.openWeights) &&
      (args.minContextTokens === undefined || m.context >= args.minContextTokens) &&
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
    modelsDevProviderId: v.optional(v.string()),
    family: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(modelDoc),
  handler: async (ctx, { query: text, modelsDevProviderId, family, limit }) => {
    const count = boundedLimit(limit, 10, 50);
    const term = text.trim().toLowerCase();
    if (!term) return [];
    return ctx.db
      .query("models")
      .withSearchIndex("search_name", (q) => {
        let builder = q.search("searchText", term);
        if (modelsDevProviderId !== undefined)
          builder = builder.eq("modelsDevProviderId", modelsDevProviderId);
        if (family !== undefined) builder = builder.eq("family", family);
        return builder;
      })
      .take(count);
  },
});

export const listCheapest = query({
  args: {
    minContextTokens: v.optional(v.number()),
    minOutputTokens: v.optional(v.number()),
    reasoning: v.optional(v.boolean()),
    toolCall: v.optional(v.boolean()),
    structuredOutput: v.optional(v.boolean()),
    inputModalities: v.optional(modalityList),
    modelsDevProviderIds: v.optional(v.array(v.string())),
    excludeFree: v.optional(v.boolean()),
    excludeDeprecated: v.optional(v.boolean()),
    distinctCanonical: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.object({ models: v.array(modelDoc), isComplete: v.boolean() }),
  handler: async (ctx, args) => {
    finiteBounds(args.minContextTokens, args.minOutputTokens);
    const limit = boundedLimit(args.limit, 5, 20);
    const excludeDeprecated = args.excludeDeprecated ?? true;
    const required = masks(args.inputModalities).reduce((acc, bit) => acc | bit, 0);
    const providers = args.modelsDevProviderIds ? new Set(args.modelsDevProviderIds) : undefined;
    const matches = (m: Doc<"models">) =>
      (args.minContextTokens === undefined || m.context >= args.minContextTokens) &&
      (args.minOutputTokens === undefined || m.output >= args.minOutputTokens) &&
      (args.reasoning === undefined || m.reasoning === args.reasoning) &&
      (args.toolCall === undefined || m.toolCall === args.toolCall) &&
      (args.structuredOutput === undefined || m.structuredOutput === args.structuredOutput) &&
      (required === 0 || (m.inputMask & required) === required) &&
      (!providers || providers.has(m.modelsDevProviderId)) &&
      (!args.excludeFree || (m.costBlended ?? 0) > 0) &&
      (!excludeDeprecated || m.status !== "deprecated");

    const results: Doc<"models">[] = [];
    const canonical = new Set<string>();
    let scanned = 0;

    const ordered = providers
      ? [...providers].map((modelsDevProviderId) =>
          ctx.db
            .query("models")
            .withIndex("by_modelsDevProviderId_and_costBlended", (q) =>
              q.eq("modelsDevProviderId", modelsDevProviderId).gte("costBlended", 0),
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
          const key =
            m.modelsDevCanonicalModelId ??
            JSON.stringify([m.modelsDevProviderId, m.modelsDevModelId]);
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

export const listEquivalents = query({
  args: { modelsDevCanonicalModelId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(modelDoc),
  handler: async (ctx, { modelsDevCanonicalModelId, limit }) => {
    return ctx.db
      .query("models")
      .withIndex("by_modelsDevCanonicalModelId_and_hasCost_and_costOrder", (q) =>
        q.eq("modelsDevCanonicalModelId", modelsDevCanonicalModelId),
      )
      .order("desc")
      .take(boundedLimit(limit, 200, 200));
  },
});

export const listPriceChanges = query({
  args: {
    modelsDevProviderId: v.string(),
    modelsDevModelId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(schema.doc("priceChanges")),
  handler: (ctx, { modelsDevProviderId, modelsDevModelId, limit }) =>
    ctx.db
      .query("priceChanges")
      .withIndex("by_modelsDevProviderId_and_modelsDevModelId_and_changedAt", (q) =>
        q.eq("modelsDevProviderId", modelsDevProviderId).eq("modelsDevModelId", modelsDevModelId),
      )
      .order("desc")
      .take(boundedLimit(limit, 50, 200)),
});

export const estimateCost = query({
  args: {
    provider: v.string(),
    model: v.string(),
    usage: usageValidator,
    mode: v.union(v.string(), v.null()),
    inputTokenScope: inputTokenScopeValidator,
    aliases: v.optional(v.record(v.string(), v.string())),
  },
  returns: costEstimateValidator,
  handler: async (ctx, args) => {
    validateUsage(args.usage);
    const row = await resolveRow(ctx, args.provider, args.model, args.aliases);
    if (!row) return { known: false as const };
    return estimateModelCost(row, args.usage, {
      mode: args.mode,
      inputTokenScope: args.inputTokenScope,
    });
  },
});
