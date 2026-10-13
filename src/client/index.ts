import type {
  FunctionArgs,
  FunctionReturnType,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  PaginationOptions,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
export { isModelsDevError } from "../shared/errors.js";
import type { UsageInput } from "../shared/validators.js";

export { estimateCost, usageFromAgent } from "../shared/cost.js";
export type { CostModel, EstimateCostOptions } from "../shared/cost.js";
export {
  DEFAULT_PROVIDER_ALIASES,
  providerCandidates,
  resolveModel,
  splitModelKey,
} from "../shared/resolve.js";
export type { ModelsDevErrorCode, ModelsDevErrorData } from "../shared/errors.js";
export {
  syncStatusValidator,
  syncSummaryValidator,
  type CostBreakdown,
  type CostEstimate,
  type PriceFields,
  type PriceTier,
  type SyncStatus,
  type SyncSummary,
  type SyncSourceError,
  type UsageInput,
} from "../shared/validators.js";

type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type MutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;
type ActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runAction">;

export type ModelsDevOptions = {
  aliases?: Record<string, string>;
};

export type ListModelsArgs = Omit<
  FunctionArgs<ComponentApi["models"]["list"]>,
  "paginationOpts"
> & { paginationOpts: PaginationOptions };

export type CheapestResult = FunctionReturnType<ComponentApi["models"]["cheapest"]>;

export type EstimateCostArgs = Omit<FunctionArgs<ComponentApi["models"]["estimate"]>, "usage"> & {
  usage: UsageInput;
};

export class ModelsDev {
  readonly models;
  readonly providers;
  readonly sync;
  readonly config;

  constructor(
    public readonly component: ComponentApi,
    options: ModelsDevOptions = {},
  ) {
    const { models, providers, sync, config } = component;
    const aliases = (overrides: Record<string, string> | undefined) =>
      options.aliases ? { ...options.aliases, ...overrides } : overrides;

    this.models = {
      get: (ctx: QueryCtx, args: FunctionArgs<typeof models.get>) =>
        ctx.runQuery(models.get, { providerId: args.providerId, modelId: args.modelId }),

      getByKey: (ctx: QueryCtx, args: FunctionArgs<typeof models.getByKey>) =>
        ctx.runQuery(models.getByKey, { key: args.key }),

      resolve: (ctx: QueryCtx, args: FunctionArgs<typeof models.resolve>) =>
        ctx.runQuery(models.resolve, {
          provider: args.provider,
          model: args.model,
          aliases: aliases(args.aliases),
        }),

      list: (ctx: QueryCtx, args: ListModelsArgs) =>
        ctx.runQuery(models.list, {
          providerId: args.providerId,
          family: args.family,
          status: args.status,
          reasoning: args.reasoning,
          toolCall: args.toolCall,
          structuredOutput: args.structuredOutput,
          openWeights: args.openWeights,
          inputModalities: args.inputModalities,
          outputModalities: args.outputModalities,
          minContext: args.minContext,
          maxCostInput: args.maxCostInput,
          includeDeprecated: args.includeDeprecated,
          order: args.order,
          paginationOpts: {
            numItems: args.paginationOpts.numItems,
            cursor: args.paginationOpts.cursor,
            endCursor: args.paginationOpts.endCursor,
            maximumRowsRead: args.paginationOpts.maximumRowsRead,
            maximumBytesRead: args.paginationOpts.maximumBytesRead,
          },
        }),

      search: (ctx: QueryCtx, args: FunctionArgs<typeof models.search>) =>
        ctx.runQuery(models.search, {
          query: args.query,
          providerId: args.providerId,
          family: args.family,
          limit: args.limit,
        }),

      cheapest: (
        ctx: QueryCtx,
        args: FunctionArgs<typeof models.cheapest> = {},
      ): Promise<CheapestResult> =>
        ctx.runQuery(models.cheapest, {
          minContext: args.minContext,
          minOutput: args.minOutput,
          reasoning: args.reasoning,
          toolCall: args.toolCall,
          structuredOutput: args.structuredOutput,
          inputModalities: args.inputModalities,
          providerIds: args.providerIds,
          excludeFree: args.excludeFree,
          excludeDeprecated: args.excludeDeprecated,
          distinctCanonical: args.distinctCanonical,
          limit: args.limit,
        }),

      equivalents: (ctx: QueryCtx, args: FunctionArgs<typeof models.equivalents>) =>
        ctx.runQuery(models.equivalents, {
          canonicalModelId: args.canonicalModelId,
          limit: args.limit,
        }),

      priceHistory: (ctx: QueryCtx, args: FunctionArgs<typeof models.priceHistory>) =>
        ctx.runQuery(models.priceHistory, {
          providerId: args.providerId,
          modelId: args.modelId,
          limit: args.limit,
        }),

      estimateCost: (ctx: QueryCtx, args: EstimateCostArgs) =>
        ctx.runQuery(models.estimate, {
          provider: args.provider,
          model: args.model,
          usage: {
            inputTokens: args.usage.inputTokens,
            promptTokens: args.usage.promptTokens,
            outputTokens: args.usage.outputTokens,
            completionTokens: args.usage.completionTokens,
            cacheReadTokens: args.usage.cacheReadTokens,
            cachedInputTokens: args.usage.cachedInputTokens,
            cacheWriteTokens: args.usage.cacheWriteTokens,
            cacheWriteInputTokens: args.usage.cacheWriteInputTokens,
            noCacheTokens: args.usage.noCacheTokens,
            nonCachedInputTokens: args.usage.nonCachedInputTokens,
            reasoningTokens: args.usage.reasoningTokens,
            textOutputTokens: args.usage.textOutputTokens,
            inputAudioTokens: args.usage.inputAudioTokens,
            outputAudioTokens: args.usage.outputAudioTokens,
          },
          mode: args.mode,
          inputIncludesCache: args.inputIncludesCache,
          aliases: aliases(args.aliases),
        }),
    };

    this.providers = {
      list: (ctx: QueryCtx) => ctx.runQuery(providers.list, {}),
      get: (ctx: QueryCtx, args: FunctionArgs<typeof providers.get>) =>
        ctx.runQuery(providers.get, { providerId: args.providerId }),
    };

    this.sync = {
      now: (ctx: ActionCtx, args: FunctionArgs<typeof sync.syncNow> = {}) =>
        ctx.runAction(sync.syncNow, { force: args.force }),

      status: (ctx: QueryCtx) => ctx.runQuery(sync.status, {}),
    };

    this.config = {
      get: (ctx: QueryCtx) => ctx.runQuery(config.get, {}),

      update: (ctx: MutationCtx, args: FunctionArgs<typeof config.configure>) =>
        ctx.runMutation(config.configure, {
          enabled: args.enabled,
          sourceUrl: args.sourceUrl,
          minIntervalMinutes: args.minIntervalMinutes,
          retentionDays: args.retentionDays,
          minProviders: args.minProviders,
          minModels: args.minModels,
        }),
    };
  }
}
