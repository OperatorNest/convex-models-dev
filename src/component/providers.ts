import { paginator } from "convex-helpers/server/pagination";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { boundedPage } from "../shared/bounds.js";
import { v } from "convex/values";
import { query } from "./_generated/server.js";
import schema from "./schema.js";

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("providers")),
  handler: (ctx, { paginationOpts }) =>
    paginator(ctx.db, schema)
      .query("providers")
      .withIndex("by_modelsDevProviderId")
      .paginate(boundedPage(paginationOpts, 3)),
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
