import { v } from "convex/values";
import { query } from "./_generated/server.js";
import schema from "./schema.js";

export const list = query({
  args: {},
  returns: v.array(schema.doc("providers")),
  handler: (ctx) => ctx.db.query("providers").withIndex("by_providerId").take(500),
});

export const get = query({
  args: { providerId: v.string() },
  returns: v.union(schema.doc("providers"), v.null()),
  handler: (ctx, { providerId }) =>
    ctx.db
      .query("providers")
      .withIndex("by_providerId", (q) => q.eq("providerId", providerId))
      .first(),
});
