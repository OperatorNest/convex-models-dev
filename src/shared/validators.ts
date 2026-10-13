import { v, type Infer } from "convex/values";
import { MODELS_DEV_ERROR_CODES } from "./errors.js";

export const modelsDevErrorValidator = v.object({
  code: v.union(...MODELS_DEV_ERROR_CODES.map((code) => v.literal(code))),
  message: v.string(),
  retryable: v.optional(v.boolean()),
  providerStatus: v.optional(v.number()),
  providerCode: v.optional(v.string()),
});

export const modelStatusValidator = v.union(
  v.literal("alpha"),
  v.literal("beta"),
  v.literal("deprecated"),
);
/** Names the catalog maturity or retirement state of a model. */
export type ModelStatus = Infer<typeof modelStatusValidator>;

export const costFieldsValidator = v.object({
  input: v.optional(v.number()),
  output: v.optional(v.number()),
  cacheRead: v.optional(v.number()),
  cacheWrite: v.optional(v.number()),
  reasoning: v.optional(v.number()),
  inputAudio: v.optional(v.number()),
  outputAudio: v.optional(v.number()),
});

/** Contains USD rates per million tokens for each catalog token category. */
export type CostFields = Infer<typeof costFieldsValidator>;

export const tierValidator = v.object({ size: v.number(), ...costFieldsValidator.fields });
/** Contains catalog token rates above a context-token threshold. */
export type CostTier = Infer<typeof tierValidator>;

export const modesValidator = v.record(
  v.string(),
  v.object({
    cost: v.optional(costFieldsValidator),
    tiers: v.optional(v.array(tierValidator)),
  }),
);

export const reasoningOptionValidator = v.union(
  v.object({ type: v.literal("toggle") }),
  v.object({
    type: v.literal("effort"),
    values: v.array(v.union(v.null(), v.string())),
  }),
  v.object({
    type: v.literal("budget_tokens"),
    min: v.optional(v.number()),
    max: v.optional(v.number()),
  }),
);

export const interleavedValidator = v.union(v.literal(true), v.object({ field: v.string() }));

export const providerValidator = v.object({
  npm: v.optional(v.string()),
  api: v.optional(v.string()),
  shape: v.optional(v.string()),
});

export const modelFields = {
  modelsDevProviderId: v.string(),
  modelsDevModelId: v.string(),
  modelsDevCanonicalModelId: v.optional(v.string()),
  name: v.string(),
  family: v.optional(v.string()),
  description: v.optional(v.string()),
  searchText: v.string(),

  attachment: v.boolean(),
  reasoning: v.boolean(),
  toolCall: v.boolean(),
  structuredOutput: v.optional(v.boolean()),
  temperature: v.optional(v.boolean()),
  openWeights: v.boolean(),
  status: v.optional(modelStatusValidator),
  inputMask: v.number(),
  outputMask: v.number(),
  reasoningOptions: v.optional(v.array(reasoningOptionValidator)),
  interleaved: v.optional(interleavedValidator),

  context: v.number(),
  output: v.number(),
  input: v.optional(v.number()),

  releaseDate: v.string(),
  lastUpdated: v.string(),
  knowledge: v.optional(v.string()),

  hasCost: v.boolean(),
  costInput: v.optional(v.number()),
  costOutput: v.optional(v.number()),
  costCacheRead: v.optional(v.number()),
  costCacheWrite: v.optional(v.number()),
  costReasoning: v.optional(v.number()),
  costInputAudio: v.optional(v.number()),
  costOutputAudio: v.optional(v.number()),
  costBlended: v.optional(v.number()),
  costOrder: v.number(),
  tiers: v.optional(v.array(tierValidator)),
  modes: v.optional(modesValidator),
  provider: v.optional(providerValidator),
};

const modelRowValidator = v.object(modelFields);
/** Contains normalized models.dev model fields and derived query fields. */
export type ModelRow = Infer<typeof modelRowValidator>;

export const modelInputValidator = v.object({ ...modelFields, contentHash: v.string() });
/** Contains a normalized catalog model and its content hash. */
export type ModelInput = Infer<typeof modelInputValidator>;

export const providerFields = {
  modelsDevProviderId: v.string(),
  name: v.string(),
  npm: v.optional(v.string()),
  env: v.array(v.string()),
  doc: v.optional(v.string()),
  api: v.optional(v.string()),
  modelCount: v.number(),
};

const providerRowValidator = v.object(providerFields);
/** Contains normalized models.dev provider metadata. */
export type ProviderRow = Infer<typeof providerRowValidator>;

export const providerInputValidator = v.object({ ...providerFields, contentHash: v.string() });
/** Contains normalized provider metadata and its content hash. */
export type ProviderInput = Infer<typeof providerInputValidator>;

export const pricingSnapshotValidator = v.object({
  ...costFieldsValidator.fields,
  tiers: v.optional(v.array(tierValidator)),
  modes: v.optional(modesValidator),
});
/** Contains the token rates, context tiers and pricing modes recorded for a model. */
export type PricingSnapshot = Infer<typeof pricingSnapshotValidator>;

export const priceChangeKindValidator = v.union(
  v.literal("added"),
  v.literal("removed"),
  v.literal("price"),
  v.literal("tiers"),
);

export const usageValidator = v.object({
  inputTokens: v.optional(v.number()),
  promptTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  completionTokens: v.optional(v.number()),
  cacheReadTokens: v.optional(v.number()),
  cachedInputTokens: v.optional(v.number()),
  cacheWriteTokens: v.optional(v.number()),
  cacheWriteInputTokens: v.optional(v.number()),
  noCacheTokens: v.optional(v.number()),
  nonCachedInputTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  textOutputTokens: v.optional(v.number()),
  inputAudioTokens: v.optional(v.number()),
  outputAudioTokens: v.optional(v.number()),
});

export const costBreakdownValidator = v.object({
  uncachedInput: v.number(),
  cacheRead: v.number(),
  cacheWrite: v.number(),
  inputAudio: v.number(),
  text: v.number(),
  reasoning: v.number(),
  outputAudio: v.number(),
});
/** Contains estimated USD cost for each token category. */
export type CostBreakdown = Infer<typeof costBreakdownValidator>;

export const costEstimateValidator = v.union(
  v.object({ known: v.literal(false) }),
  v.object({
    known: v.literal(true),
    usd: v.number(),
    nanoUsd: v.number(),
    breakdown: costBreakdownValidator,

    tier: v.union(v.number(), v.null()),
    mode: v.union(v.string(), v.null()),
    assumptions: v.array(v.string()),
    priceSnapshotAt: v.union(v.number(), v.null()),
  }),
);

/** Contains a safe token cost estimate or declares pricing unknown. */
export type CostEstimate = Infer<typeof costEstimateValidator>;
/** Contains reported token counts for model cost estimation. */
export type UsageInput = Infer<typeof usageValidator>;

export const lastStatusValidator = v.union(
  v.literal("ok"),
  v.literal("not_modified"),
  v.literal("partial"),
  v.literal("error"),
);

export const syncStateValidator = v.union(
  v.literal("never_synced"),
  v.literal("ok"),
  v.literal("error"),
);

export const syncCountsFields = {
  providerCount: v.number(),
  modelCount: v.number(),
  added: v.number(),
  updated: v.number(),
  removed: v.number(),
  priceChanges: v.number(),
  skippedModels: v.number(),
  removalSkipped: v.boolean(),
};

export const syncSourceErrorValidator = v.object({
  source: v.union(v.literal("primary"), v.literal("fallback")),
  ...modelsDevErrorValidator.fields,
});
/** Contains a fixed diagnostic for one attempted catalog source. */
export type SyncSourceError = Infer<typeof syncSourceErrorValidator>;

export const syncStatusValidator = v.object({
  state: syncStateValidator,

  running: v.boolean(),
  leaseExpiresAt: v.optional(v.number()),
  source: v.optional(v.string()),
  lastCheckedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  lastStatus: v.optional(lastStatusValidator),
  errors: v.array(syncSourceErrorValidator),
  ...syncCountsFields,
  durationMs: v.number(),
});
/** Contains the recorded catalog sync state, counters and diagnostics. */
export type SyncStatus = Infer<typeof syncStatusValidator>;

export const syncSkipReasonValidator = v.union(
  v.literal("disabled"),
  v.literal("min_interval"),
  v.literal("already_running"),
);
/** Names the condition that prevented a catalog sync from starting. */
export type SyncSkipReason = Infer<typeof syncSkipReasonValidator>;

export const syncSummaryValidator = v.object({
  status: v.union(lastStatusValidator, v.literal("skipped")),
  reason: v.optional(syncSkipReasonValidator),
  errors: v.array(syncSourceErrorValidator),
  source: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  ...v.object(syncCountsFields).partial().fields,
});
/** Contains the outcome, counters and ordered diagnostics of a catalog sync invocation. */
export type SyncSummary = Infer<typeof syncSummaryValidator>;

/** Names the outcome of a completed catalog sync attempt. */
export type SyncRunStatus = Infer<typeof lastStatusValidator>;
/** Names the state derived from the last completed catalog sync. */
export type SyncState = Infer<typeof syncStateValidator>;
/** Names the outcome of a catalog sync invocation, including a skipped attempt. */
export type SyncSummaryStatus = SyncSummary["status"];
/** Names the catalog history event recorded for a model. */
export type PriceChangeKind = Infer<typeof priceChangeKindValidator>;

export const inputTokenScopeValidator = v.union(
  v.literal("includesCache"),
  v.literal("excludesCache"),
);
/** Specifies whether reported input tokens include cache reads and writes. */
export type InputTokenScope = Infer<typeof inputTokenScopeValidator>;
