import {
  ModelsDev,
  syncStatusValidator,
  syncSummaryValidator,
  usageFromAgent,
} from "@operatornest/convex-models-dev";
import { paginationResultValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { components } from "./_generated/api.js";
import { internalAction, internalMutation, query, type QueryCtx } from "./_generated/server.js";

async function requireIdentity(ctx: Pick<QueryCtx, "auth">): Promise<void> {
  if (!(await ctx.auth.getUserIdentity())) throw new Error("Not signed in.");
}
const modelsDev = new ModelsDev(components.modelsDev);

const modelSummary = v.object({
  providerId: v.string(),
  modelId: v.string(),
  name: v.string(),
  contextLimit: v.number(),
  costInput: v.optional(v.number()),
  costOutput: v.optional(v.number()),
});
type ModelSummary = Infer<typeof modelSummary>;

function summarize(m: ModelSummary): ModelSummary {
  return {
    providerId: m.providerId,
    modelId: m.modelId,
    name: m.name,
    contextLimit: m.contextLimit,
    ...(m.costInput !== undefined && { costInput: m.costInput }),
    ...(m.costOutput !== undefined && { costOutput: m.costOutput }),
  };
}

export const syncStatus = query({
  args: {},
  returns: syncStatusValidator,
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return modelsDev.sync.status(ctx);
  },
});

export const syncNow = internalAction({
  args: { force: v.optional(v.boolean()) },
  returns: syncSummaryValidator,
  handler: (ctx, { force }) => modelsDev.sync.now(ctx, force === undefined ? {} : { force }),
});

export const configureSync = internalMutation({
  args: { minModels: v.optional(v.number()), minProviders: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await modelsDev.config.update(ctx, args);
    return null;
  },
});

export const getModel = query({
  args: { key: v.string() },
  returns: v.union(modelSummary, v.null()),
  handler: async (ctx, { key }) => {
    await requireIdentity(ctx);
    const model = await modelsDev.models.getByKey(ctx, { key });
    return model ? summarize(model) : null;
  },
});

export const listModels = query({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: paginationResultValidator(modelSummary),
  handler: async (ctx, { cursor, numItems }) => {
    await requireIdentity(ctx);
    const result = await modelsDev.models.list(ctx, { paginationOpts: { cursor, numItems } });
    return { ...result, page: result.page.map(summarize) };
  },
});

export const cheapestWithTools = query({
  args: { minContext: v.optional(v.number()) },
  returns: v.object({ models: v.array(modelSummary), isComplete: v.boolean() }),
  handler: async (ctx, { minContext }) => {
    await requireIdentity(ctx);
    const result = await modelsDev.models.cheapest(ctx, {
      toolCall: true,
      excludeFree: true,
      ...(minContext !== undefined && { minContext }),
    });
    return { models: result.models.map(summarize), isComplete: result.isComplete };
  },
});

export const costOfUsage = query({
  args: {
    provider: v.string(),
    model: v.string(),

    rawUsage: v.any(),
    rawProviderMetadata: v.optional(v.any()),
  },
  returns: v.union(v.null(), v.number()),
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    const estimate = await modelsDev.models.estimateCost(ctx, {
      provider: args.provider,
      model: args.model,
      usage: usageFromAgent({
        usage: args.rawUsage,
        providerMetadata: args.rawProviderMetadata,
      }),
    });
    return estimate.known ? estimate.nanoUsd : null;
  },
});
