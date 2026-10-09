import { v, type Infer } from "convex/values";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server.js";
import { modelsDevError } from "../shared/errors.js";

const PRIMARY_SOURCE_URL = "https://models.dev/api.json";
export const FALLBACK_SOURCE_URL = "https://models.opencode.ai/api.json";
const MIN_INTERVAL_FLOOR_MINUTES = 15;

const DEFAULTS = {
  enabled: true,
  sourceUrl: PRIMARY_SOURCE_URL,
  minIntervalMinutes: MIN_INTERVAL_FLOOR_MINUTES,
  retentionDays: 365,
  minProviders: 50,
  minModels: 1000,
};

export const effectiveConfigValidator = v.object({
  enabled: v.boolean(),
  sourceUrl: v.string(),
  minIntervalMinutes: v.number(),
  retentionDays: v.number(),
  minProviders: v.number(),
  minModels: v.number(),
});

export type EffectiveConfig = Infer<typeof effectiveConfigValidator>;

export async function loadConfig(ctx: QueryCtx): Promise<EffectiveConfig> {
  const row = await ctx.db.query("config").first();
  return {
    enabled: row?.enabled ?? DEFAULTS.enabled,
    sourceUrl: row?.sourceUrl ?? DEFAULTS.sourceUrl,
    minIntervalMinutes: row?.minIntervalMinutes ?? DEFAULTS.minIntervalMinutes,
    retentionDays: row?.retentionDays ?? DEFAULTS.retentionDays,
    minProviders: row?.minProviders ?? DEFAULTS.minProviders,
    minModels: row?.minModels ?? DEFAULTS.minModels,
  };
}

export const get = query({
  args: {},
  returns: effectiveConfigValidator,
  handler: (ctx) => loadConfig(ctx),
});

export const getEffective = internalQuery({
  args: {},
  returns: effectiveConfigValidator,
  handler: (ctx) => loadConfig(ctx),
});

function assertFinite(name: string, value: number, min: number) {
  if (!Number.isFinite(value) || value < min) {
    throw modelsDevError("MODELS_DEV_INVALID_CONFIG", `${name} must be a finite number >= ${min}`);
  }
}

export const configure = mutation({
  args: {
    enabled: v.optional(v.boolean()),
    sourceUrl: v.optional(v.string()),
    minIntervalMinutes: v.optional(v.number()),
    retentionDays: v.optional(v.number()),
    minProviders: v.optional(v.number()),
    minModels: v.optional(v.number()),
  },
  returns: effectiveConfigValidator,
  handler: async (ctx, args) => {
    if (args.sourceUrl !== undefined) {
      let url: URL;
      try {
        url = new URL(args.sourceUrl);
      } catch {
        throw modelsDevError("MODELS_DEV_INVALID_SOURCE_URL", "sourceUrl must be a valid URL");
      }
      if (url.protocol !== "https:") {
        throw modelsDevError("MODELS_DEV_INVALID_SOURCE_URL", "sourceUrl must use https");
      }
      if (url.username || url.password) {
        throw modelsDevError(
          "MODELS_DEV_INVALID_SOURCE_URL",
          "sourceUrl must not contain credentials",
        );
      }
    }
    if (args.minIntervalMinutes !== undefined) {
      assertFinite("minIntervalMinutes", args.minIntervalMinutes, MIN_INTERVAL_FLOOR_MINUTES);
    }
    if (args.retentionDays !== undefined) assertFinite("retentionDays", args.retentionDays, 1);
    if (args.minProviders !== undefined) assertFinite("minProviders", args.minProviders, 0);
    if (args.minModels !== undefined) assertFinite("minModels", args.minModels, 0);

    const row = await ctx.db.query("config").first();
    if (row) await ctx.db.patch("config", row._id, args);
    else await ctx.db.insert("config", args);
    return loadConfig(ctx);
  },
});
