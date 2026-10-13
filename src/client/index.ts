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
export { MODELS_DEV_ERROR_CODES, isModelsDevError } from "../shared/errors.js";
import type { UsageInput } from "../shared/validators.js";

export { estimateCost, extractUsage } from "../shared/cost.js";
export type { CostModel, EstimateCostOptions } from "../shared/cost.js";
export {
  DEFAULT_PROVIDER_ALIASES,
  listProviderCandidates,
  resolveModel,
  splitModelKey,
} from "../shared/resolve.js";
export type { ModelsDevErrorCode, ModelsDevErrorData } from "../shared/errors.js";
export {
  syncStatusValidator,
  syncSummaryValidator,
  type CostBreakdown,
  type CostEstimate,
  type CostFields,
  type CostTier,
  type InputTokenScope,
  type ModelStatus,
  type SyncRunStatus,
  type SyncState,
  type SyncSummaryStatus,
  type SyncSkipReason,
  type PriceChangeKind,
  type SyncStatus,
  type SyncSummary,
  type SyncSourceError,
  type UsageInput,
} from "../shared/validators.js";

/** Supplies the query runner used to read stored catalog rows. */
export type QueryContext = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
/** Supplies the mutation runner used to update catalog configuration. */
export type MutationContext = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;
/** Supplies the action runner used to synchronize the catalog. */
export type ActionContext = Pick<GenericActionCtx<GenericDataModel>, "runAction">;

/** Configures provider aliases for catalog model resolution. */
export type ModelsDevOptions = {
  aliases?: Record<string, string>;
};

/** Selects stored models and bounds a catalog page. */
export type ListModelsArgs = Omit<
  FunctionArgs<ComponentApi["models"]["list"]>,
  "paginationOpts"
> & { paginationOpts: PaginationOptions };

/** Contains price-ranked catalog models and whether the scan completed. */
export type CheapestResult = FunctionReturnType<ComponentApi["models"]["listCheapest"]>;

/** Selects a stored model and supplies token usage with explicit pricing choices. */
export type EstimateCostArgs = Omit<
  FunctionArgs<ComponentApi["models"]["estimateCost"]>,
  "usage"
> & {
  usage: UsageInput;
};

/** Provides aggregate operations over the stored models.dev catalog. */
export class ModelsDev {
  readonly models;
  readonly providers;
  readonly sync;
  readonly config;

  /** Binds catalog aggregate operations to the installed component and provider aliases. */
  constructor(
    public readonly component: ComponentApi,
    options: ModelsDevOptions = {},
  ) {
    const { models, providers, sync, config } = component;
    const aliases = (overrides: Record<string, string> | undefined) => {
      if (!options.aliases) return overrides;
      return Object.fromEntries([
        ...Object.entries(options.aliases),
        ...Object.entries(overrides ?? {}),
      ]);
    };

    this.models = {
      /** Reads the stored catalog row for the supplied catalog identity. */
      get: (ctx: QueryContext, args: FunctionArgs<typeof models.get>) =>
        ctx.runQuery(models.get, {
          modelsDevProviderId: args.modelsDevProviderId,
          modelsDevModelId: args.modelsDevModelId,
        }),

      /** Reads a stored model by its provider-qualified catalog key. */
      getByKey: (ctx: QueryContext, args: FunctionArgs<typeof models.getByKey>) =>
        ctx.runQuery(models.getByKey, { key: args.key }),

      /** Reads a stored model after resolving provider aliases. */
      resolve: (ctx: QueryContext, args: FunctionArgs<typeof models.resolve>) =>
        ctx.runQuery(models.resolve, {
          provider: args.provider,
          model: args.model,
          aliases: aliases(args.aliases),
        }),

      /** Lists stored catalog rows within the declared read bounds. */
      list: (ctx: QueryContext, args: ListModelsArgs) =>
        ctx.runQuery(models.list, {
          modelsDevProviderId: args.modelsDevProviderId,
          family: args.family,
          status: args.status,
          reasoning: args.reasoning,
          toolCall: args.toolCall,
          structuredOutput: args.structuredOutput,
          openWeights: args.openWeights,
          inputModalities: args.inputModalities,
          outputModalities: args.outputModalities,
          minContextTokens: args.minContextTokens,
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

      /** Searches stored model names and catalog identifiers. */
      search: (ctx: QueryContext, args: FunctionArgs<typeof models.search>) =>
        ctx.runQuery(models.search, {
          query: args.query,
          modelsDevProviderId: args.modelsDevProviderId,
          family: args.family,
          limit: args.limit,
        }),

      /** Lists the cheapest stored models matching the capability filters. */
      listCheapest: (
        ctx: QueryContext,
        args: FunctionArgs<typeof models.listCheapest> = {},
      ): Promise<CheapestResult> =>
        ctx.runQuery(models.listCheapest, {
          minContextTokens: args.minContextTokens,
          minOutputTokens: args.minOutputTokens,
          reasoning: args.reasoning,
          toolCall: args.toolCall,
          structuredOutput: args.structuredOutput,
          inputModalities: args.inputModalities,
          modelsDevProviderIds: args.modelsDevProviderIds,
          excludeFree: args.excludeFree,
          excludeDeprecated: args.excludeDeprecated,
          distinctCanonical: args.distinctCanonical,
          limit: args.limit,
        }),

      /** Lists stored offerings of the same canonical model in price order. */
      listEquivalents: (ctx: QueryContext, args: FunctionArgs<typeof models.listEquivalents>) =>
        ctx.runQuery(models.listEquivalents, {
          modelsDevCanonicalModelId: args.modelsDevCanonicalModelId,
          limit: args.limit,
        }),

      /** Lists the stored price changes for a catalog model. */
      listPriceChanges: (ctx: QueryContext, args: FunctionArgs<typeof models.listPriceChanges>) =>
        ctx.runQuery(models.listPriceChanges, {
          modelsDevProviderId: args.modelsDevProviderId,
          modelsDevModelId: args.modelsDevModelId,
          limit: args.limit,
        }),

      /** Estimates token cost using a stored model and explicit input counting semantics. */
      estimateCost: (ctx: QueryContext, args: EstimateCostArgs) =>
        ctx.runQuery(models.estimateCost, {
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
          inputTokenScope: args.inputTokenScope,
          aliases: aliases(args.aliases),
        }),
    };

    this.providers = {
      /** Lists stored catalog rows within the declared read bounds. */
      list: (ctx: QueryContext) => ctx.runQuery(providers.list, {}),
      /** Reads the stored catalog row for the supplied catalog identity. */
      get: (ctx: QueryContext, args: FunctionArgs<typeof providers.get>) =>
        ctx.runQuery(providers.get, { modelsDevProviderId: args.modelsDevProviderId }),
    };

    this.sync = {
      /** Synchronizes the catalog while enforcing interval and catalog-loss guards. */
      run: (ctx: ActionContext) => ctx.runAction(sync.run, {}),
      /** Synchronizes the catalog while bypassing interval and catalog-loss guards. */
      runForced: (ctx: ActionContext) => ctx.runAction(sync.runForced, {}),

      /** Reads the recorded catalog sync state and ordered source diagnostics. */
      getStatus: (ctx: QueryContext) => ctx.runQuery(sync.getStatus, {}),
    };

    this.config = {
      /** Reads the stored catalog row for the supplied catalog identity. */
      get: (ctx: QueryContext) => ctx.runQuery(config.get, {}),

      /** Updates supplied catalog sync settings while retaining omitted settings. */
      update: (ctx: MutationContext, args: FunctionArgs<typeof config.update>) =>
        ctx.runMutation(config.update, {
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
