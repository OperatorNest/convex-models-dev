import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";
import { loadConfig } from "./config.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 500;

export const run = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { retentionDays } = await loadConfig(ctx);
    const cutoff = Date.now() - retentionDays * DAY_MS;
    const rows = await ctx.db
      .query("priceChanges")
      .withIndex("by_changedAt", (q) => q.lt("changedAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);
    for (const row of rows) await ctx.db.delete("priceChanges", row._id);
    if (rows.length === CLEANUP_BATCH_SIZE)
      await ctx.scheduler.runAfter(0, internal.cleanup.run, {});
    return null;
  },
});
