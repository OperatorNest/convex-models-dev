import {
  ModelsDev,
  syncStatusValidator,
  syncSummaryValidator,
  extractUsage,
} from "@operatornest/convex-models-dev";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { components } from "./_generated/api.js";
import { internalAction, internalMutation, query, type QueryCtx } from "./_generated/server.js";

async function requireIdentity(ctx: Pick<QueryCtx, "auth">): Promise<void> {
  if (!(await ctx.auth.getUserIdentity())) throw new Error("Not signed in.");
}
const modelsDev = new ModelsDev(components.modelsDev);

const modelSummary = v.object({
  modelsDevProviderId: v.string(),
  modelsDevModelId: v.string(),
  name: v.string(),
  contextTokens: v.number(),
  costInput: v.optional(v.number()),
  costOutput: v.optional(v.number()),
});
type ModelSummary = Infer<typeof modelSummary>;

function summarize(
  m: Omit<ModelSummary, "contextTokens"> & { limit: { context: number } },
): ModelSummary {
  return {
    modelsDevProviderId: m.modelsDevProviderId,
    modelsDevModelId: m.modelsDevModelId,
    name: m.name,
    contextTokens: m.limit.context,
    ...(m.costInput !== undefined && { costInput: m.costInput }),
    ...(m.costOutput !== undefined && { costOutput: m.costOutput }),
  };
}

export const syncStatus = query({
  args: {},
  returns: syncStatusValidator,
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return modelsDev.sync.getStatus(ctx);
  },
});

export const syncNow = internalAction({
  args: {},
  returns: syncSummaryValidator,
  handler: (ctx) => modelsDev.sync.run(ctx),
});

export const syncForced = internalAction({
  args: {},
  returns: syncSummaryValidator,
  handler: (ctx) => modelsDev.sync.runForced(ctx),
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
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(modelSummary),
  handler: async (ctx, { paginationOpts }) => {
    await requireIdentity(ctx);
    const result = await modelsDev.models.list(ctx, { paginationOpts });
    return { ...result, page: result.page.map(summarize) };
  },
});

export const cheapestWithTools = query({
  args: { minContextTokens: v.optional(v.number()) },
  returns: v.object({ models: v.array(modelSummary), isComplete: v.boolean() }),
  handler: async (ctx, { minContextTokens }) => {
    await requireIdentity(ctx);
    const result = await modelsDev.models.listCheapest(ctx, {
      toolCall: true,
      excludeFree: true,
      ...(minContextTokens !== undefined && { minContextTokens }),
    });
    return { models: result.models.map(summarize), isComplete: result.isComplete };
  },
});

export const costOfUsage = query({
  args: {
    provider: v.string(),
    model: v.string(),
    mode: v.union(v.string(), v.null()),
    inputTokenScope: v.union(v.literal("includesCache"), v.literal("excludesCache")),

    rawUsage: v.any(),
    rawProviderMetadata: v.optional(v.any()),
  },
  returns: v.union(v.null(), v.number()),
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    const estimate = await modelsDev.models.estimateCost(ctx, {
      mode: args.mode,
      inputTokenScope: args.inputTokenScope,
      provider: args.provider,
      model: args.model,
      usage: extractUsage({
        usage: args.rawUsage,
        providerMetadata: args.rawProviderMetadata,
      }),
    });
    return estimate.known ? estimate.nanoUsd : null;
  },
});
