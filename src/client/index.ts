import type {
  FunctionArgs,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  PaginationOptions,
} from "convex/server";
import { ConvexError } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import { MODELS_DEV_ERROR_CODES, type ModelsDevErrorData } from "../shared/errors.js";
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
  type UsageInput,
} from "../shared/validators.js";

/** True for an error thrown by this component. Narrows `error.data` to code and message. */
export function isModelsDevError(error: unknown): error is ConvexError<ModelsDevErrorData> {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    MODELS_DEV_ERROR_CODES.some((code) => code === data.code) &&
    "message" in data &&
    typeof data.message === "string" &&
    (!("retryable" in data) || data.retryable === undefined || typeof data.retryable === "boolean")
  );
}

type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type MutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;
type ActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runAction">;

export type ModelsDevOptions = {
  /** Extra AI SDK provider string to models.dev provider id mappings, applied to every `resolve` and `estimateCost` call. Per-call `aliases` win. */
  aliases?: Record<string, string>;
};

export type ListModelsArgs = Omit<
  FunctionArgs<ComponentApi["models"]["list"]>,
  "paginationOpts"
> & { paginationOpts: PaginationOptions };

export type EstimateCostArgs = Omit<FunctionArgs<ComponentApi["models"]["estimate"]>, "usage"> & {
  usage: UsageInput;
};

/** App-side wrapper around the `modelsDev` component. */
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
    const withAliases = <T extends { aliases?: Record<string, string> }>(args: T): T =>
      options.aliases ? { ...args, aliases: { ...options.aliases, ...args.aliases } } : args;

    this.models = {
      /** One model by exact `{ providerId, modelId }`, or null. */
      get: (ctx: QueryCtx, args: FunctionArgs<typeof models.get>) => ctx.runQuery(models.get, args),
      /** One model by `"provider/model"` or `"provider:model"`, or null. */
      getByKey: (ctx: QueryCtx, args: FunctionArgs<typeof models.getByKey>) =>
        ctx.runQuery(models.getByKey, args),
      /** Maps an AI SDK `{ provider, model }` pair to a catalog row, or null. */
      resolve: (ctx: QueryCtx, args: FunctionArgs<typeof models.resolve>) =>
        ctx.runQuery(models.resolve, withAliases(args)),
      /** Filtered, ordered page of models. */
      list: (ctx: QueryCtx, args: ListModelsArgs) => ctx.runQuery(models.list, args),
      /** Full-text search over name, id, family and provider. */
      search: (ctx: QueryCtx, args: FunctionArgs<typeof models.search>) =>
        ctx.runQuery(models.search, args),
      /** Cheapest models that satisfy the given capabilities. */
      cheapest: (ctx: QueryCtx, args: FunctionArgs<typeof models.cheapest> = {}) =>
        ctx.runQuery(models.cheapest, args),
      /** Every provider serving the same canonical model, cheapest first. */
      equivalents: (ctx: QueryCtx, args: FunctionArgs<typeof models.equivalents>) =>
        ctx.runQuery(models.equivalents, args),
      /** Recorded price changes for one model, newest first. */
      priceHistory: (ctx: QueryCtx, args: FunctionArgs<typeof models.priceHistory>) =>
        ctx.runQuery(models.priceHistory, args),
      /** Resolves the model, then estimates the cost of `usage` from the stored price. */
      estimateCost: (ctx: QueryCtx, args: EstimateCostArgs) =>
        ctx.runQuery(models.estimate, withAliases(args)),
    };

    this.providers = {
      list: (ctx: QueryCtx) => ctx.runQuery(providers.list, {}),
      get: (ctx: QueryCtx, args: FunctionArgs<typeof providers.get>) =>
        ctx.runQuery(providers.get, args),
    };

    this.sync = {
      /** Runs a sync now. `force` skips the minimum-interval floor and the removal guard. */
      now: (ctx: ActionCtx, args: FunctionArgs<typeof sync.syncNow> = {}) =>
        ctx.runAction(sync.syncNow, args),
      /**
       * Sync state and the last run's counters. `running` means a lease is recorded;
       * compare `leaseExpiresAt` with your own clock to ignore an expired one.
       */
      status: (ctx: QueryCtx) => ctx.runQuery(sync.status, {}),
    };

    this.config = {
      get: (ctx: QueryCtx) => ctx.runQuery(config.get, {}),
      /** Changes sync settings; omitted fields keep their current value. */
      update: (ctx: MutationCtx, args: FunctionArgs<typeof config.configure>) =>
        ctx.runMutation(config.configure, args),
    };
  }
}
