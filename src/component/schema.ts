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
  }).index("by_providerId", ["providerId"]),

  models: defineTable({
    ...modelFields,
    contentHash: v.string(),
    firstSeenAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_providerId_and_modelId", ["providerId", "modelId"])
    .index("by_canonicalModelId_and_hasCost_and_costOrder", [
      "canonicalModelId",
      "hasCost",
      "costOrder",
    ])
    .index("by_providerId_and_releaseDate", ["providerId", "releaseDate"])
    .index("by_family_and_releaseDate", ["family", "releaseDate"])
    .index("by_releaseDate", ["releaseDate"])
    .index("by_contextLimit", ["contextLimit"])
    .index("by_providerId_and_contextLimit", ["providerId", "contextLimit"])
    .index("by_family_and_contextLimit", ["family", "contextLimit"])
    .index("by_providerId_and_costBlended", ["providerId", "costBlended"])
    .index("by_family_and_costBlended", ["family", "costBlended"])
    .index("by_costBlended", ["costBlended"])
    .searchIndex("search_name", {
      searchField: "searchText",
      filterFields: ["providerId", "family"],
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
    providerId: v.string(),
    modelId: v.string(),
    at: v.number(),
    kind: priceChangeKindValidator,
    before: v.optional(pricingSnapshotValidator),
    after: v.optional(pricingSnapshotValidator),
  })
    .index("by_providerId_and_modelId_and_at", ["providerId", "modelId", "at"])
    .index("by_at", ["at"]),

  config: defineTable({
    enabled: v.optional(v.boolean()),
    sourceUrl: v.optional(v.string()),
    minIntervalMinutes: v.optional(v.number()),
    retentionDays: v.optional(v.number()),
    minProviders: v.optional(v.number()),
    minModels: v.optional(v.number()),
  }),
});
