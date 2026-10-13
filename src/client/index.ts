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
  KNOWN_MODEL_STATUSES,
  type CostBreakdown,
  type CostEstimate,
  type CostFields,
  type CostTier,
  type InputTokenScope,
  type PartialReason,
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

// shared-block:begin
/** Runs component queries; app queries, mutations and actions provide it. */
export type QueryContext = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
/** Runs component mutations; app mutations and actions provide it. */
export type MutationContext = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;
/** Runs component actions; app actions provide it. */
export type ActionContext = Pick<GenericActionCtx<GenericDataModel>, "runAction">;
// shared-block:end

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
  /** Binds catalog aggregate operations to the installed component and provider aliases. */
  constructor(
    private readonly component: ComponentApi,
    private readonly options: ModelsDevOptions = {},
  ) {}

  /** Reads stored models, ranks them by price and estimates token cost. */
  readonly models = {
    /** Reads one stored model by models.dev provider and model IDs. */
    get: (ctx: QueryContext, args: FunctionArgs<ComponentApi["models"]["get"]>) =>
      ctx.runQuery(this.component.models.get, {
        modelsDevProviderId: args.modelsDevProviderId,
        modelsDevModelId: args.modelsDevModelId,
      }),

    /** Reads a stored model by its provider-qualified catalog key. */
    getByKey: (ctx: QueryContext, args: FunctionArgs<ComponentApi["models"]["getByKey"]>) =>
      ctx.runQuery(this.component.models.getByKey, { key: args.key }),

    /** Reads a stored model after resolving provider aliases. */
    resolve: (ctx: QueryContext, args: FunctionArgs<ComponentApi["models"]["resolve"]>) =>
      ctx.runQuery(this.component.models.resolve, {
        provider: args.provider,
        model: args.model,
        aliases: mergeAliases(this.options.aliases, args.aliases),
      }),

    /** Lists stored models within the declared read bounds. */
    list: (ctx: QueryContext, args: ListModelsArgs) =>
      ctx.runQuery(this.component.models.list, {
        modelsDevProviderId: args.modelsDevProviderId,
        family: args.family,
        type: args.type,
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
        },
      }),

    /** Searches stored model names and catalog identifiers. */
    search: (ctx: QueryContext, args: FunctionArgs<ComponentApi["models"]["search"]>) =>
      ctx.runQuery(this.component.models.search, {
        query: args.query,
        modelsDevProviderId: args.modelsDevProviderId,
        family: args.family,
        limit: args.limit,
      }),

    /** Lists the cheapest stored models matching the capability filters. */
    listCheapest: (
      ctx: QueryContext,
      args: FunctionArgs<ComponentApi["models"]["listCheapest"]> = {},
    ): Promise<CheapestResult> =>
      ctx.runQuery(this.component.models.listCheapest, {
        minContextTokens: args.minContextTokens,
        minOutputTokens: args.minOutputTokens,
        reasoning: args.reasoning,
        toolCall: args.toolCall,
        structuredOutput: args.structuredOutput,
        inputModalities: args.inputModalities,
        type: args.type,
        modelsDevProviderIds: args.modelsDevProviderIds,
        excludeFree: args.excludeFree,
        excludeDeprecated: args.excludeDeprecated,
        distinctCanonical: args.distinctCanonical,
        limit: args.limit,
      }),

    /** Lists stored offerings of the same canonical model in price order. */
    listEquivalents: (
      ctx: QueryContext,
      args: FunctionArgs<ComponentApi["models"]["listEquivalents"]>,
    ) =>
      ctx.runQuery(this.component.models.listEquivalents, {
        modelsDevCanonicalModelId: args.modelsDevCanonicalModelId,
        limit: args.limit,
      }),

    /** Lists the stored price changes for a catalog model. */
    listPriceChanges: (
      ctx: QueryContext,
      args: FunctionArgs<ComponentApi["models"]["listPriceChanges"]>,
    ) =>
      ctx.runQuery(this.component.models.listPriceChanges, {
        modelsDevProviderId: args.modelsDevProviderId,
        modelsDevModelId: args.modelsDevModelId,
        limit: args.limit,
      }),

    /** Estimates token cost using a stored model and explicit input counting semantics. */
    estimateCost: (ctx: QueryContext, args: EstimateCostArgs) =>
      ctx.runQuery(this.component.models.estimateCost, {
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
        aliases: mergeAliases(this.options.aliases, args.aliases),
      }),
  };

  /** Reads stored models.dev providers. */
  readonly providers = {
    /** Lists stored providers, at most 500. */
    list: (ctx: QueryContext) => ctx.runQuery(this.component.providers.list, {}),
    /** Reads one stored provider by models.dev provider ID. */
    get: (ctx: QueryContext, args: FunctionArgs<ComponentApi["providers"]["get"]>) =>
      ctx.runQuery(this.component.providers.get, { modelsDevProviderId: args.modelsDevProviderId }),
  };

  /** Synchronizes the catalog and reads the recorded sync status. */
  readonly sync = {
    /** Synchronizes the catalog while enforcing interval and catalog-loss guards. */
    run: (ctx: ActionContext) => ctx.runAction(this.component.sync.run, {}),
    /** Synchronizes the catalog while bypassing interval and catalog-loss guards. */
    runForced: (ctx: ActionContext) => ctx.runAction(this.component.sync.runForced, {}),

    /** Reads the recorded catalog sync state and ordered source diagnostics. */
    getStatus: (ctx: QueryContext) => ctx.runQuery(this.component.sync.getStatus, {}),
  };

  /** Reads and updates the table-backed sync settings. */
  readonly config = {
    /** Reads the effective sync settings, with defaults for unset values. */
    get: (ctx: QueryContext) => ctx.runQuery(this.component.config.get, {}),

    /** Updates supplied catalog sync settings while retaining omitted settings. */
    update: (ctx: MutationContext, args: FunctionArgs<ComponentApi["config"]["update"]>) =>
      ctx.runMutation(this.component.config.update, {
        enabled: args.enabled,
        sourceUrl: args.sourceUrl,
        minIntervalMinutes: args.minIntervalMinutes,
        retentionDays: args.retentionDays,
        minProviders: args.minProviders,
        minModels: args.minModels,
      }),
  };
}

function mergeAliases(
  defaults: Record<string, string> | undefined,
  overrides: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (defaults === undefined) return overrides;
  return Object.fromEntries(Object.entries(defaults).concat(Object.entries(overrides ?? {})));
}
