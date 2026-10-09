import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  lastStatusValidator,
  modelFields,
  priceChangeKindValidator,
  pricingSnapshotValidator,
  providerFields,
  syncCountsFields,
} from "../shared/validators.js";

export default defineSchema({
  providers: defineTable({
    ...providerFields,
    contentHash: v.string(),
    updatedAt: v.number(),
  }).index("by_providerId", ["providerId"]),

  models: defineTable({
    ...modelFields,
    contentHash: v.string(),
    firstSeenAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_model", ["providerId", "modelId"])
    .index("by_canonical", ["canonicalModelId"])
    .index("by_provider_release", ["providerId", "releaseDate"])
    .index("by_family_release", ["family", "releaseDate"])
    .index("by_release", ["releaseDate"])
    .index("by_context", ["contextLimit"])
    .index("by_provider_context", ["providerId", "contextLimit"])
    .index("by_family_context", ["family", "contextLimit"])
    .index("by_provider_cost", ["providerId", "costBlended"])
    .index("by_family_cost", ["family", "costBlended"])
    .index("by_cost_blended", ["costBlended"])
    .searchIndex("search_name", {
      searchField: "searchText",
      filterFields: ["providerId", "family"],
    }),

  // Singleton: sync bookkeeping and the run lease.
  syncState: defineTable({
    source: v.string(),
    etag: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    lastCheckedAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
    lastStatus: v.optional(lastStatusValidator),
    lastError: v.optional(v.string()),
    ...syncCountsFields,
    durationMs: v.number(),
    running: v.boolean(),
    runId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
  }),

  priceChanges: defineTable({
    providerId: v.string(),
    modelId: v.string(),
    at: v.number(),
    kind: priceChangeKindValidator,
    before: v.optional(pricingSnapshotValidator),
    after: v.optional(pricingSnapshotValidator),
  })
    .index("by_model_at", ["providerId", "modelId", "at"])
    .index("by_at", ["at"]),

  // Singleton: settings changed through `configure`.
  config: defineTable({
    enabled: v.optional(v.boolean()),
    sourceUrl: v.optional(v.string()),
    minIntervalMinutes: v.optional(v.number()),
    retentionDays: v.optional(v.number()),
    minProviders: v.optional(v.number()),
    minModels: v.optional(v.number()),
  }),
});
