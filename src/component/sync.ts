import { paginator } from "convex-helpers/server/pagination";
import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import schema from "./schema.js";
import { internal } from "./_generated/api.js";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "./_generated/server.js";
import { effectiveConfigValidator, loadConfig } from "./config.js";
import { boundedPage } from "../shared/bounds.js";
import { canonicalJson } from "../shared/hash.js";
import { pricingOf } from "../shared/normalize.js";
import {
  lastStatusValidator,
  modelInputValidator,
  partialReasonValidator,
  providerInputValidator,
  syncCountsFields,
  syncStatusValidator,
  syncSourceErrorValidator,
  syncSummaryValidator,
  syncSkipReasonValidator,
  type PricingSnapshot,
  type SyncStatus,
} from "../shared/validators.js";
import { runSync } from "./syncCore.js";

const LEASE_MS = 3 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CRON_TOLERANCE_MS = 5 * 60 * 1000;

export const getStatus = query({
  args: {},
  returns: syncStatusValidator,
  handler: async (ctx): Promise<SyncStatus> => {
    const row = await ctx.db.query("syncState").first();
    const base = {
      providerCount: 0,
      modelCount: 0,
      added: 0,
      updated: 0,
      removed: 0,
      priceChanges: 0,
      skippedModels: 0,
      durationMs: 0,
    };
    if (!row) return { state: "never_synced", running: false, errors: [], ...base };
    const state =
      row.lastStatus === "error" ? "error" : row.lastSyncedAt === undefined ? "never_synced" : "ok";
    return {
      state,
      running: row.running,
      ...(row.running &&
        row.leaseExpiresAt !== undefined && { leaseExpiresAt: row.leaseExpiresAt }),
      sourceUrl: row.sourceUrl,
      ...(row.lastCheckedAt > 0 && { lastCheckedAt: row.lastCheckedAt }),
      ...(row.lastSyncedAt !== undefined && { lastSyncedAt: row.lastSyncedAt }),
      ...(row.lastStatus !== undefined && { lastStatus: row.lastStatus }),
      ...(row.partialReason !== undefined && { partialReason: row.partialReason }),
      errors: row.errors,
      providerCount: row.providerCount,
      modelCount: row.modelCount,
      added: row.added,
      updated: row.updated,
      removed: row.removed,
      priceChanges: row.priceChanges,
      skippedModels: row.skippedModels,
      durationMs: row.durationMs,
    };
  },
});

export const run = action({
  args: {},
  returns: syncSummaryValidator,
  handler: (ctx) => runSync(ctx, { force: false, cron: false }),
});

export const runForced = action({
  args: {},
  returns: syncSummaryValidator,
  handler: (ctx) => runSync(ctx, { force: true, cron: false }),
});

export const tick = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await runSync(ctx, { force: false, cron: true });

    for (let i = 0; i < 20; i++) {
      const deleted = await ctx.runMutation(internal.sync.cleanupPriceChanges, {});
      if (deleted < 500) break;
    }
    return null;
  },
});

const beginResult = v.union(
  v.object({ proceed: v.literal(false), reason: syncSkipReasonValidator }),
  v.object({
    proceed: v.literal(true),
    config: effectiveConfigValidator,
    isFirstSync: v.boolean(),
    state: v.optional(
      v.object({
        sourceUrl: v.string(),
        etag: v.optional(v.string()),
        contentHash: v.optional(v.string()),
      }),
    ),
  }),
);

export const begin = internalMutation({
  args: { runId: v.string(), force: v.boolean(), cron: v.boolean() },
  returns: beginResult,
  handler: async (ctx, { runId, force, cron }) => {
    const now = Date.now();
    const config = await loadConfig(ctx);
    if (cron && !config.enabled) return { proceed: false as const, reason: "disabled" as const };

    const row = await ctx.db.query("syncState").first();
    if (row?.running && (row.leaseExpiresAt ?? 0) > now) {
      return { proceed: false as const, reason: "already_running" as const };
    }
    const floorMs = config.minIntervalMinutes * 60 * 1000 - (cron ? CRON_TOLERANCE_MS : 0);
    if (!force && row && row.lastCheckedAt > 0 && now - row.lastCheckedAt < floorMs) {
      return { proceed: false as const, reason: "min_interval" as const };
    }

    const lease = { running: true, runId, leaseExpiresAt: now + LEASE_MS };
    if (row) await ctx.db.patch("syncState", row._id, lease);
    else {
      await ctx.db.insert("syncState", {
        sourceUrl: config.sourceUrl,
        errors: [],
        lastCheckedAt: 0,
        providerCount: 0,
        modelCount: 0,
        added: 0,
        updated: 0,
        removed: 0,
        priceChanges: 0,
        skippedModels: 0,
        durationMs: 0,
        ...lease,
      });
    }
    return {
      proceed: true as const,
      config,
      isFirstSync: row?.lastSyncedAt === undefined,
      ...(row && {
        state: {
          sourceUrl: row.sourceUrl,
          ...(row.etag !== undefined && { etag: row.etag }),
          ...(row.contentHash !== undefined && { contentHash: row.contentHash }),
        },
      }),
    };
  },
});

async function holdLease(ctx: MutationCtx, runId: string): Promise<boolean> {
  const row = await ctx.db.query("syncState").first();
  if (!row || row.runId !== runId) return false;
  await ctx.db.patch("syncState", row._id, {
    leaseExpiresAt: Date.now() + LEASE_MS,
    etag: undefined,
    contentHash: undefined,
  });
  return true;
}

export const upsertProviders = internalMutation({
  args: { runId: v.string(), providers: v.array(providerInputValidator) },
  returns: v.object({ leaseLost: v.boolean() }),
  handler: async (ctx, { runId, providers }) => {
    if (!(await holdLease(ctx, runId))) return { leaseLost: true };
    const now = Date.now();
    for (const provider of providers) {
      const existing = await ctx.db
        .query("providers")
        .withIndex("by_modelsDevProviderId", (q) =>
          q.eq("modelsDevProviderId", provider.modelsDevProviderId),
        )
        .first();
      if (!existing) await ctx.db.insert("providers", { ...provider, updatedAt: now });
      else if (existing.contentHash !== provider.contentHash) {
        await ctx.db.replace("providers", existing._id, { ...provider, updatedAt: now });
      }
    }
    return { leaseLost: false };
  },
});

function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function baseOf(pricing: PricingSnapshot | undefined) {
  if (!pricing) return undefined;
  const { input, output, cacheRead, cacheWrite, reasoning, inputAudio, outputAudio } = pricing;
  return { input, output, cacheRead, cacheWrite, reasoning, inputAudio, outputAudio };
}

export const upsertModels = internalMutation({
  args: { runId: v.string(), rows: v.array(modelInputValidator), recordAdded: v.boolean() },
  returns: v.object({
    leaseLost: v.boolean(),
    added: v.number(),
    updated: v.number(),
    unchanged: v.number(),
    priceChanges: v.number(),
  }),
  handler: async (ctx, { runId, rows, recordAdded }) => {
    if (!(await holdLease(ctx, runId))) {
      return { leaseLost: true, added: 0, updated: 0, unchanged: 0, priceChanges: 0 };
    }
    const now = Date.now();
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    let priceChanges = 0;
    for (const row of rows) {
      const existing = await ctx.db
        .query("models")
        .withIndex("by_modelsDevProviderId_and_modelsDevModelId", (q) =>
          q
            .eq("modelsDevProviderId", row.modelsDevProviderId)
            .eq("modelsDevModelId", row.modelsDevModelId),
        )
        .first();
      if (!existing) {
        await ctx.db.insert("models", { ...row, firstSeenAt: now, updatedAt: now });
        added++;
        const listed = pricingOf(row);
        if (recordAdded) {
          await ctx.db.insert("priceChanges", {
            modelsDevProviderId: row.modelsDevProviderId,
            modelsDevModelId: row.modelsDevModelId,
            changedAt: now,
            kind: "added",
            ...(listed && { after: listed }),
          });
          priceChanges++;
        }
        continue;
      }
      if (existing.contentHash === row.contentHash) {
        unchanged++;
        continue;
      }
      const before = pricingOf(existing);
      const after = pricingOf(row);
      if (!sameJson(before, after)) {
        const kind = !sameJson(baseOf(before), baseOf(after))
          ? "price"
          : !sameJson(before?.tiers, after?.tiers)
            ? "tiers"
            : "price";
        await ctx.db.insert("priceChanges", {
          modelsDevProviderId: row.modelsDevProviderId,
          modelsDevModelId: row.modelsDevModelId,
          changedAt: now,
          kind,
          ...(before && { before }),
          ...(after && { after }),
        });
        priceChanges++;
      }
      await ctx.db.replace("models", existing._id, {
        ...row,
        firstSeenAt: existing.firstSeenAt,
        updatedAt: now,
      });
      updated++;
    }
    return { leaseLost: false, added, updated, unchanged, priceChanges };
  },
});

export const modelKeysPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: paginationResultValidator(
    v.object({
      modelId: v.id("models"),
      modelsDevProviderId: v.string(),
      modelsDevModelId: v.string(),
      hasCost: v.boolean(),
    }),
  ),
  handler: async (ctx, { cursor, numItems }) => {
    const result = await paginator(ctx.db, schema)
      .query("models")
      .withIndex("by_modelsDevProviderId_and_modelsDevModelId")
      .paginate(boundedPage({ cursor, numItems }));
    return {
      page: result.page.map((m) => ({
        modelId: m._id,
        modelsDevProviderId: m.modelsDevProviderId,
        modelsDevModelId: m.modelsDevModelId,
        hasCost: m.hasCost,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const providerKeysPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: paginationResultValidator(
    v.object({ providerId: v.id("providers"), modelsDevProviderId: v.string() }),
  ),
  handler: async (ctx, { cursor, numItems }) => {
    const result = await paginator(ctx.db, schema)
      .query("providers")
      .withIndex("by_modelsDevProviderId")
      .paginate(boundedPage({ cursor, numItems }));
    return {
      page: result.page.map((p) => ({
        providerId: p._id,
        modelsDevProviderId: p.modelsDevProviderId,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const removeModels = internalMutation({
  args: { runId: v.string(), modelIds: v.array(v.id("models")) },
  returns: v.object({ leaseLost: v.boolean(), removed: v.number() }),
  handler: async (ctx, { runId, modelIds }) => {
    if (!(await holdLease(ctx, runId))) return { leaseLost: true, removed: 0 };
    const now = Date.now();
    let removed = 0;
    for (const modelId of modelIds) {
      const row = await ctx.db.get("models", modelId);
      if (!row) continue;
      const before = pricingOf(row);
      await ctx.db.insert("priceChanges", {
        modelsDevProviderId: row.modelsDevProviderId,
        modelsDevModelId: row.modelsDevModelId,
        changedAt: now,
        kind: "removed",
        ...(before && { before }),
      });
      await ctx.db.delete("models", modelId);
      removed++;
    }
    return { leaseLost: false, removed };
  },
});

export const removeProviders = internalMutation({
  args: { runId: v.string(), providerIds: v.array(v.id("providers")) },
  returns: v.object({ leaseLost: v.boolean() }),
  handler: async (ctx, { runId, providerIds }) => {
    if (!(await holdLease(ctx, runId))) return { leaseLost: true };
    for (const providerId of providerIds) await ctx.db.delete("providers", providerId);
    return { leaseLost: false };
  },
});

export const finish = internalMutation({
  args: {
    runId: v.string(),
    status: lastStatusValidator,
    partialReason: v.optional(partialReasonValidator),
    sourceUrl: v.optional(v.string()),
    etag: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    errors: v.optional(v.array(syncSourceErrorValidator)),
    stats: v.optional(v.object(syncCountsFields)),
    durationMs: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("syncState").first();
    if (!row || row.runId !== args.runId) return false;
    const now = Date.now();
    const common = {
      running: false,
      runId: undefined,
      leaseExpiresAt: undefined,
      lastCheckedAt: now,
      lastStatus: args.status,
      partialReason: args.status === "partial" ? args.partialReason : undefined,
      durationMs: args.durationMs,
      errors: args.errors ?? [],
    };
    if (args.status === "error") {
      await ctx.db.patch("syncState", row._id, common);
      return true;
    }
    if (args.status === "partial") {
      await ctx.db.patch("syncState", row._id, {
        ...common,
        ...args.stats,
        etag: undefined,
        contentHash: undefined,
        ...(args.sourceUrl !== undefined && { sourceUrl: args.sourceUrl }),
      });
      return true;
    }
    await ctx.db.patch("syncState", row._id, {
      ...common,
      ...(args.sourceUrl !== undefined && { sourceUrl: args.sourceUrl }),
      ...(args.status === "ok"
        ? { etag: args.etag, contentHash: args.contentHash }
        : {
            ...(args.etag !== undefined && { etag: args.etag }),
            ...(args.contentHash !== undefined && { contentHash: args.contentHash }),
          }),
      ...(args.status === "ok" && { lastSyncedAt: now, ...args.stats }),
    });
    return true;
  },
});

export const cleanupPriceChanges = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const config = await loadConfig(ctx);
    if (!config.enabled) return 0;
    const cutoff = Date.now() - config.retentionDays * DAY_MS;
    const rows = await ctx.db
      .query("priceChanges")
      .withIndex("by_changedAt", (q) => q.lt("changedAt", cutoff))
      .take(500);
    for (const row of rows) await ctx.db.delete("priceChanges", row._id);
    return rows.length;
  },
});
