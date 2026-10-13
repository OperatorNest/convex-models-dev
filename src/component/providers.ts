import { v } from "convex/values";
import { query } from "./_generated/server.js";
import schema from "./schema.js";

export const list = query({
  args: {},
  returns: v.array(schema.doc("providers")),
  handler: (ctx) => ctx.db.query("providers").withIndex("by_modelsDevProviderId").take(500),
});

export const get = query({
  args: { modelsDevProviderId: v.string() },
  returns: v.union(schema.doc("providers"), v.null()),
  handler: (ctx, { modelsDevProviderId }) =>
    ctx.db
      .query("providers")
      .withIndex("by_modelsDevProviderId", (q) => q.eq("modelsDevProviderId", modelsDevProviderId))
      .first(),
});
