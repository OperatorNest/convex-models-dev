import { v, type Infer } from "convex/values";

export const priceFieldsValidator = v.object({
  input: v.optional(v.number()),
  output: v.optional(v.number()),
  cacheRead: v.optional(v.number()),
  cacheWrite: v.optional(v.number()),
  reasoning: v.optional(v.number()),
  inputAudio: v.optional(v.number()),
  outputAudio: v.optional(v.number()),
});

/** Prices are USD per 1M tokens, as in models.dev. */
export type PriceFields = Infer<typeof priceFieldsValidator>;

/** A context-size tier: `size` is the prompt-size threshold in tokens. */
export const tierValidator = v.object({ size: v.number(), ...priceFieldsValidator.fields });
export type PriceTier = Infer<typeof tierValidator>;

export const modesValidator = v.record(
  v.string(),
  v.object({
    cost: v.optional(priceFieldsValidator),
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

export const providerOverrideValidator = v.object({
  npm: v.optional(v.string()),
  api: v.optional(v.string()),
  shape: v.optional(v.string()),
});

/** Fields of a `models` row that come from the upstream catalog. Catalog passthrough, exposed as is. */
export const modelFields = {
  providerId: v.string(),
  modelId: v.string(),
  canonicalModelId: v.optional(v.string()),
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
  status: v.optional(v.string()),
  inputMask: v.number(),
  outputMask: v.number(),
  reasoningOptions: v.optional(v.array(reasoningOptionValidator)),
  interleaved: v.optional(interleavedValidator),

  contextLimit: v.number(),
  outputLimit: v.number(),
  inputLimit: v.optional(v.number()),

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
  tiers: v.optional(v.array(tierValidator)),
  modes: v.optional(modesValidator),
  providerOverride: v.optional(providerOverrideValidator),
};

const modelRowValidator = v.object(modelFields);
export type ModelRow = Infer<typeof modelRowValidator>;

/** What the sync action sends to `upsertModels`. */
export const modelInputValidator = v.object({ ...modelFields, contentHash: v.string() });
export type ModelInput = Infer<typeof modelInputValidator>;

export const providerFields = {
  providerId: v.string(),
  name: v.string(),
  npm: v.optional(v.string()),
  env: v.array(v.string()),
  doc: v.optional(v.string()),
  api: v.optional(v.string()),
  modelCount: v.number(),
};

const providerRowValidator = v.object(providerFields);
export type ProviderRow = Infer<typeof providerRowValidator>;

export const providerInputValidator = v.object({ ...providerFields, contentHash: v.string() });
export type ProviderInput = Infer<typeof providerInputValidator>;

/** Compact cost object stored in `priceChanges`. */
export const pricingSnapshotValidator = v.object({
  ...priceFieldsValidator.fields,
  tiers: v.optional(v.array(tierValidator)),
  modes: v.optional(modesValidator),
});
export type PricingSnapshot = Infer<typeof pricingSnapshotValidator>;

export const priceChangeKindValidator = v.union(
  v.literal("added"),
  v.literal("removed"),
  v.literal("price"),
  v.literal("tiers"),
);

/** Union of AI SDK 7, AI SDK 5/6 and `@convex-dev/agent` usage spellings. */
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

/** Each term of a cost estimate, in USD. */
export const costBreakdownValidator = v.object({
  uncachedInput: v.number(),
  cacheRead: v.number(),
  cacheWrite: v.number(),
  inputAudio: v.number(),
  text: v.number(),
  reasoning: v.number(),
  outputAudio: v.number(),
});
export type CostBreakdown = Infer<typeof costBreakdownValidator>;

export const costEstimateValidator = v.union(
  v.object({ known: v.literal(false) }),
  v.object({
    known: v.literal(true),
    usd: v.number(),
    nanoUsd: v.number(),
    breakdown: costBreakdownValidator,
    /** Size of the applied context tier, or null. */
    tier: v.union(v.number(), v.null()),
    mode: v.union(v.string(), v.null()),
    assumptions: v.array(v.string()),
    priceSnapshotAt: v.union(v.number(), v.null()),
  }),
);

export type CostEstimate = Infer<typeof costEstimateValidator>;
export type UsageInput = Infer<typeof usageValidator>;

/** `partial`: the run completed but skipped the removal pass (`removalSkipped`), so it is not a finished sync. */
export const lastStatusValidator = v.union(
  v.literal("ok"),
  v.literal("not_modified"),
  v.literal("partial"),
  v.literal("error"),
);

/** Overall sync state as reported by `sync.status`. */
export const syncStateValidator = v.union(
  v.literal("never_synced"),
  v.literal("ok"),
  v.literal("error"),
);

/** Counters of the last completed run, shared by `syncState`, `status`, `finish` and the summary. */
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

export const syncStatusValidator = v.object({
  state: syncStateValidator,
  /** A lease is recorded. Compare `leaseExpiresAt` with your clock to ignore an expired one. */
  running: v.boolean(),
  leaseExpiresAt: v.optional(v.number()),
  source: v.optional(v.string()),
  lastCheckedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  lastStatus: v.optional(lastStatusValidator),
  lastError: v.optional(v.string()),
  ...syncCountsFields,
  durationMs: v.number(),
});
export type SyncStatus = Infer<typeof syncStatusValidator>;

export const syncSummaryValidator = v.object({
  status: v.union(lastStatusValidator, v.literal("skipped")),
  reason: v.optional(v.string()),
  source: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  ...v.object(syncCountsFields).partial().fields,
});
export type SyncSummary = Infer<typeof syncSummaryValidator>;
