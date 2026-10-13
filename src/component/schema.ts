import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  lastStatusValidator,
  modelFields,
  priceChangeKindValidator,
  pricingSnapshotValidator,
  providerFields,
  syncCountsFields,
  syncSourceErrorValidator,
} from "../shared/validators.js";

export default defineSchema({
  providers: defineTable({
    ...providerFields,
    contentHash: v.string(),
    updatedAt: v.number(),
  }).index("by_modelsDevProviderId", ["modelsDevProviderId"]),

  models: defineTable({
    ...modelFields,
    contentHash: v.string(),
    firstSeenAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_modelsDevProviderId_and_modelsDevModelId", [
      "modelsDevProviderId",
      "modelsDevModelId",
    ])
    .index("by_modelsDevCanonicalModelId_and_hasCost_and_costOrder", [
      "modelsDevCanonicalModelId",
      "hasCost",
      "costOrder",
    ])
    .index("by_modelsDevProviderId_and_releaseDate", ["modelsDevProviderId", "releaseDate"])
    .index("by_family_and_releaseDate", ["family", "releaseDate"])
    .index("by_releaseDate", ["releaseDate"])
    .index("by_context", ["context"])
    .index("by_modelsDevProviderId_and_context", ["modelsDevProviderId", "context"])
    .index("by_family_and_context", ["family", "context"])
    .index("by_modelsDevProviderId_and_costBlended", ["modelsDevProviderId", "costBlended"])
    .index("by_family_and_costBlended", ["family", "costBlended"])
    .index("by_costBlended", ["costBlended"])
    .searchIndex("search_name", {
      searchField: "searchText",
      filterFields: ["modelsDevProviderId", "family"],
    }),

  syncState: defineTable({
    source: v.string(),
    etag: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    lastCheckedAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
    lastStatus: v.optional(lastStatusValidator),
    errors: v.array(syncSourceErrorValidator),
    ...syncCountsFields,
    durationMs: v.number(),
    running: v.boolean(),
    runId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
  }),

  priceChanges: defineTable({
    modelsDevProviderId: v.string(),
    modelsDevModelId: v.string(),
    changedAt: v.number(),
    kind: priceChangeKindValidator,
    before: v.optional(pricingSnapshotValidator),
    after: v.optional(pricingSnapshotValidator),
  })
    .index("by_modelsDevProviderId_and_modelsDevModelId_and_changedAt", [
      "modelsDevProviderId",
      "modelsDevModelId",
      "changedAt",
    ])
    .index("by_changedAt", ["changedAt"]),

  config: defineTable({
    enabled: v.optional(v.boolean()),
    sourceUrl: v.optional(v.string()),
    minIntervalMinutes: v.optional(v.number()),
    retentionDays: v.optional(v.number()),
    minProviders: v.optional(v.number()),
    minModels: v.optional(v.number()),
  }),
});
