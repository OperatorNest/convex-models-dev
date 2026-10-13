import { v, type Infer } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server.js";
import { utf8Bytes } from "../shared/bounds.js";
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

function assertFinite(value: number, min: number) {
  if (!Number.isFinite(value) || value < min) {
    throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
  }
}

export const update = mutation({
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
      if (!args.sourceUrl.isWellFormed() || utf8Bytes(args.sourceUrl) > 2048)
        throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
      let url: URL;
      try {
        url = new URL(args.sourceUrl);
      } catch {
        throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
      }
      if (url.protocol !== "https:" || url.username || url.password || /[?#]/.test(args.sourceUrl))
        throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
    }
    if (args.minIntervalMinutes !== undefined) {
      assertFinite(args.minIntervalMinutes, MIN_INTERVAL_FLOOR_MINUTES);
    }
    if (args.retentionDays !== undefined) assertFinite(args.retentionDays, 1);
    if (args.minProviders !== undefined) assertFinite(args.minProviders, 0);
    if (args.minModels !== undefined) assertFinite(args.minModels, 0);

    const row = await ctx.db.query("config").first();
    if (row) await ctx.db.patch("config", row._id, args);
    else await ctx.db.insert("config", args);
    return loadConfig(ctx);
  },
});
