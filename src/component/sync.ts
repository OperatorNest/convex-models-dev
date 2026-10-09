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
import { canonicalJson } from "../shared/hash.js";
import { pricingOf } from "../shared/normalize.js";
import {
  lastStatusValidator,
  modelInputValidator,
  providerInputValidator,
  syncCountsFields,
  syncStatusValidator,
  syncSummaryValidator,
  type PricingSnapshot,
  type SyncStatus,
} from "../shared/validators.js";
import { runSync } from "./syncCore.js";

const LEASE_MS = 3 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CRON_TOLERANCE_MS = 5 * 60 * 1000;

export const status = query({
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
      removalSkipped: false,
      durationMs: 0,
    };
    if (!row) return { state: "never_synced", running: false, ...base };
    const state =
      row.lastStatus === "error" ? "error" : row.lastSyncedAt === undefined ? "never_synced" : "ok";
    return {
      state,
      running: row.running,
      ...(row.running &&
        row.leaseExpiresAt !== undefined && { leaseExpiresAt: row.leaseExpiresAt }),
      source: row.source,
      ...(row.lastCheckedAt > 0 && { lastCheckedAt: row.lastCheckedAt }),
      ...(row.lastSyncedAt !== undefined && { lastSyncedAt: row.lastSyncedAt }),
      ...(row.lastStatus !== undefined && { lastStatus: row.lastStatus }),
      ...(row.lastError !== undefined && { lastError: row.lastError }),
      providerCount: row.providerCount,
      modelCount: row.modelCount,
      added: row.added,
      updated: row.updated,
      removed: row.removed,
      priceChanges: row.priceChanges,
      skippedModels: row.skippedModels,
      removalSkipped: row.removalSkipped,
      durationMs: row.durationMs,
    };
  },
});

export const syncNow = action({
  args: { force: v.optional(v.boolean()) },
  returns: syncSummaryValidator,
  handler: (ctx, { force }) => runSync(ctx, { force: force ?? false, cron: false }),
});

export const tick = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await runSync(ctx, { force: false, cron: true });
    const config = await ctx.runQuery(internal.config.getEffective, {});
    const cutoff = Date.now() - config.retentionDays * DAY_MS;
    for (let i = 0; i < 20; i++) {
      const deleted = await ctx.runMutation(internal.sync.cleanupPriceChanges, {
        cutoff,
        limit: 500,
      });
      if (deleted < 500) break;
    }
    return null;
  },
});

const beginResult = v.union(
  v.object({ proceed: v.literal(false), reason: v.string() }),
  v.object({
    proceed: v.literal(true),
    config: effectiveConfigValidator,
    isFirstSync: v.boolean(),
    state: v.optional(
      v.object({
        source: v.string(),
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
    if (cron && !config.enabled) return { proceed: false as const, reason: "disabled" };

    const row = await ctx.db.query("syncState").first();
    if (row?.running && (row.leaseExpiresAt ?? 0) > now) {
      return { proceed: false as const, reason: "already_running" };
    }
    const floorMs = config.minIntervalMinutes * 60 * 1000 - (cron ? CRON_TOLERANCE_MS : 0);
    if (!force && row && row.lastCheckedAt > 0 && now - row.lastCheckedAt < floorMs) {
      return { proceed: false as const, reason: "min_interval" };
    }

    const lease = { running: true, runId, leaseExpiresAt: now + LEASE_MS };
    if (row) await ctx.db.patch("syncState", row._id, lease);
    else {
      await ctx.db.insert("syncState", {
        source: config.sourceUrl,
        lastCheckedAt: 0,
        providerCount: 0,
        modelCount: 0,
        added: 0,
        updated: 0,
        removed: 0,
        priceChanges: 0,
        skippedModels: 0,
        removalSkipped: false,
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
          source: row.source,
          ...(row.etag !== undefined && { etag: row.etag }),
          ...(row.contentHash !== undefined && { contentHash: row.contentHash }),
        },
      }),
    };
  },
});

/** True when `runId` still owns an unexpired lease; extends the lease as a side effect. */
async function holdLease(ctx: MutationCtx, runId: string): Promise<boolean> {
  const row = await ctx.db.query("syncState").first();
  const now = Date.now();
  if (!row || row.runId !== runId || (row.leaseExpiresAt ?? 0) <= now) return false;
  await ctx.db.patch("syncState", row._id, { leaseExpiresAt: now + LEASE_MS });
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
        .withIndex("by_providerId", (q) => q.eq("providerId", provider.providerId))
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
        .withIndex("by_provider_model", (q) =>
          q.eq("providerId", row.providerId).eq("modelId", row.modelId),
        )
        .first();
      if (!existing) {
        await ctx.db.insert("models", { ...row, firstSeenAt: now, updatedAt: now });
        added++;
        const listed = pricingOf(row);
        if (recordAdded) {
          await ctx.db.insert("priceChanges", {
            providerId: row.providerId,
            modelId: row.modelId,
            at: now,
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
          providerId: row.providerId,
          modelId: row.modelId,
          at: now,
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
    v.object({ id: v.id("models"), providerId: v.string(), modelId: v.string() }),
  ),
  handler: async (ctx, { cursor, numItems }) => {
    const result = await paginator(ctx.db, schema)
      .query("models")
      .withIndex("by_provider_model")
      .paginate({ cursor, numItems });
    return {
      page: result.page.map((m) => ({ id: m._id, providerId: m.providerId, modelId: m.modelId })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const providerKeysPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: paginationResultValidator(v.object({ id: v.id("providers"), providerId: v.string() })),
  handler: async (ctx, { cursor, numItems }) => {
    const result = await paginator(ctx.db, schema)
      .query("providers")
      .withIndex("by_providerId")
      .paginate({ cursor, numItems });
    return {
      page: result.page.map((p) => ({ id: p._id, providerId: p.providerId })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const removeModels = internalMutation({
  args: { runId: v.string(), ids: v.array(v.id("models")) },
  returns: v.object({ leaseLost: v.boolean(), removed: v.number() }),
  handler: async (ctx, { runId, ids }) => {
    if (!(await holdLease(ctx, runId))) return { leaseLost: true, removed: 0 };
    const now = Date.now();
    let removed = 0;
    for (const id of ids) {
      const row = await ctx.db.get("models", id);
      if (!row) continue;
      const before = pricingOf(row);
      await ctx.db.insert("priceChanges", {
        providerId: row.providerId,
        modelId: row.modelId,
        at: now,
        kind: "removed",
        ...(before && { before }),
      });
      await ctx.db.delete("models", id);
      removed++;
    }
    return { leaseLost: false, removed };
  },
});

export const removeProviders = internalMutation({
  args: { runId: v.string(), ids: v.array(v.id("providers")) },
  returns: v.object({ leaseLost: v.boolean() }),
  handler: async (ctx, { runId, ids }) => {
    if (!(await holdLease(ctx, runId))) return { leaseLost: true };
    for (const id of ids) await ctx.db.delete("providers", id);
    return { leaseLost: false };
  },
});

export const finish = internalMutation({
  args: {
    runId: v.string(),
    status: lastStatusValidator,
    source: v.optional(v.string()),
    etag: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    error: v.optional(v.string()),
    stats: v.optional(v.object(syncCountsFields)),
    durationMs: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("syncState").first();
    const now = Date.now();
    if (!row || row.runId !== args.runId || (row.leaseExpiresAt ?? 0) <= now) return false;
    const common = {
      running: false,
      runId: undefined,
      leaseExpiresAt: undefined,
      lastCheckedAt: now,
      lastStatus: args.status,
      durationMs: args.durationMs,
    };
    if (args.status === "error") {
      await ctx.db.patch("syncState", row._id, {
        ...common,
        lastError: (args.error ?? "unknown error").slice(0, 500),
      });
      return true;
    }
    if (args.status === "partial") {
      // Removal was skipped: not a completed sync. Keep the last completed timestamp and
      // counters, flag it, and forget the etag and hash so the next run retries.
      await ctx.db.patch("syncState", row._id, {
        ...common,
        lastError: undefined,
        removalSkipped: true,
        etag: undefined,
        contentHash: undefined,
        ...(args.source !== undefined && { source: args.source }),
      });
      return true;
    }
    await ctx.db.patch("syncState", row._id, {
      ...common,
      lastError: undefined,
      ...(args.source !== undefined && { source: args.source }),
      ...(args.etag !== undefined && { etag: args.etag }),
      ...(args.contentHash !== undefined && { contentHash: args.contentHash }),
      ...(args.status === "ok" && { lastSyncedAt: now, ...args.stats }),
    });
    return true;
  },
});

export const cleanupPriceChanges = internalMutation({
  args: { cutoff: v.number(), limit: v.number() },
  returns: v.number(),
  handler: async (ctx, { cutoff, limit }) => {
    const rows = await ctx.db
      .query("priceChanges")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(limit);
    for (const row of rows) await ctx.db.delete("priceChanges", row._id);
    return rows.length;
  },
});
