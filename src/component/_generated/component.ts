/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    config: {
      get: FunctionReference<
        "query",
        "internal",
        {},
        {
          enabled: boolean;
          minIntervalMinutes: number;
          minModels: number;
          minProviders: number;
          retentionDays: number;
          sourceUrl: string;
        },
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          enabled?: boolean;
          minIntervalMinutes?: number;
          minModels?: number;
          minProviders?: number;
          retentionDays?: number;
          sourceUrl?: string;
        },
        {
          enabled: boolean;
          minIntervalMinutes: number;
          minModels: number;
          minProviders: number;
          retentionDays: number;
          sourceUrl: string;
        },
        Name
      >;
    };
    models: {
      estimateCost: FunctionReference<
        "query",
        "internal",
        {
          aliases?: Record<string, string>;
          inputTokenScope: "includesCache" | "excludesCache";
          mode: string | null;
          model: string;
          provider: string;
          usage: {
            cacheReadTokens?: number;
            cacheWriteInputTokens?: number;
            cacheWriteTokens?: number;
            cachedInputTokens?: number;
            completionTokens?: number;
            inputAudioTokens?: number;
            inputTokens?: number;
            noCacheTokens?: number;
            nonCachedInputTokens?: number;
            outputAudioTokens?: number;
            outputTokens?: number;
            promptTokens?: number;
            reasoningTokens?: number;
            textOutputTokens?: number;
          };
        },
        | { known: false }
        | {
            assumptions: Array<string>;
            breakdown: {
              cacheRead: number;
              cacheWrite: number;
              inputAudio: number;
              outputAudio: number;
              reasoning: number;
              text: number;
              uncachedInput: number;
            };
            known: true;
            mode: string | null;
            nanoUsd: number;
            priceSnapshotAt: number | null;
            tier: number | null;
            usd: number;
          },
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { modelsDevModelId: string; modelsDevProviderId: string },
        {
          _creationTime: number;
          _id: string;
          attachment: boolean;
          contentHash: string;
          contextTokens: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOrder: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          limit: { context: number; input?: number; output: number };
          modelsDevCanonicalModelId?: string;
          modelsDevModelId: string;
          modelsDevProviderId: string;
          modes?: Record<
            string,
            {
              cost?: {
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
              };
              tiers?: Array<{
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
                size: number;
              }>;
            }
          >;
          name: string;
          openWeights: boolean;
          outputMask: number;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: "alpha" | "beta" | "deprecated";
          structuredOutput?: boolean;
          temperature?: boolean;
          tiers?: Array<{
            cacheRead?: number;
            cacheWrite?: number;
            input?: number;
            inputAudio?: number;
            output?: number;
            outputAudio?: number;
            reasoning?: number;
            size: number;
          }>;
          toolCall: boolean;
          type?: string;
          updatedAt: number;
        } | null,
        Name
      >;
      getByKey: FunctionReference<
        "query",
        "internal",
        { key: string },
        {
          _creationTime: number;
          _id: string;
          attachment: boolean;
          contentHash: string;
          contextTokens: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOrder: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          limit: { context: number; input?: number; output: number };
          modelsDevCanonicalModelId?: string;
          modelsDevModelId: string;
          modelsDevProviderId: string;
          modes?: Record<
            string,
            {
              cost?: {
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
              };
              tiers?: Array<{
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
                size: number;
              }>;
            }
          >;
          name: string;
          openWeights: boolean;
          outputMask: number;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: "alpha" | "beta" | "deprecated";
          structuredOutput?: boolean;
          temperature?: boolean;
          tiers?: Array<{
            cacheRead?: number;
            cacheWrite?: number;
            input?: number;
            inputAudio?: number;
            output?: number;
            outputAudio?: number;
            reasoning?: number;
            size: number;
          }>;
          toolCall: boolean;
          type?: string;
          updatedAt: number;
        } | null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          family?: string;
          includeDeprecated?: boolean;
          inputModalities?: Array<string>;
          maxCostInput?: number;
          minContextTokens?: number;
          modelsDevProviderId?: string;
          openWeights?: boolean;
          order?: "release" | "context" | "cost";
          outputModalities?: Array<string>;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          reasoning?: boolean;
          status?: "alpha" | "beta" | "deprecated";
          structuredOutput?: boolean;
          toolCall?: boolean;
          type?: string | null;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            attachment: boolean;
            contentHash: string;
            contextTokens: number;
            costBlended?: number;
            costCacheRead?: number;
            costCacheWrite?: number;
            costInput?: number;
            costInputAudio?: number;
            costOrder: number;
            costOutput?: number;
            costOutputAudio?: number;
            costReasoning?: number;
            description?: string;
            family?: string;
            firstSeenAt: number;
            hasCost: boolean;
            inputMask: number;
            interleaved?: true | { field: string };
            knowledge?: string;
            lastUpdated: string;
            limit: { context: number; input?: number; output: number };
            modelsDevCanonicalModelId?: string;
            modelsDevModelId: string;
            modelsDevProviderId: string;
            modes?: Record<
              string,
              {
                cost?: {
                  cacheRead?: number;
                  cacheWrite?: number;
                  input?: number;
                  inputAudio?: number;
                  output?: number;
                  outputAudio?: number;
                  reasoning?: number;
                };
                tiers?: Array<{
                  cacheRead?: number;
                  cacheWrite?: number;
                  input?: number;
                  inputAudio?: number;
                  output?: number;
                  outputAudio?: number;
                  reasoning?: number;
                  size: number;
                }>;
              }
            >;
            name: string;
            openWeights: boolean;
            outputMask: number;
            providerOverride?: { api?: string; npm?: string; shape?: string };
            reasoning: boolean;
            reasoningOptions?: Array<
              | { type: "toggle" }
              | { type: "effort"; values: Array<null | string> }
              | { max?: number; min?: number; type: "budget_tokens" }
            >;
            releaseDate: string;
            searchText: string;
            status?: "alpha" | "beta" | "deprecated";
            structuredOutput?: boolean;
            temperature?: boolean;
            tiers?: Array<{
              cacheRead?: number;
              cacheWrite?: number;
              input?: number;
              inputAudio?: number;
              output?: number;
              outputAudio?: number;
              reasoning?: number;
              size: number;
            }>;
            toolCall: boolean;
            type?: string;
            updatedAt: number;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      listCheapest: FunctionReference<
        "query",
        "internal",
        {
          distinctCanonical?: boolean;
          excludeDeprecated?: boolean;
          excludeFree?: boolean;
          inputModalities?: Array<string>;
          limit?: number;
          minContextTokens?: number;
          minOutputTokens?: number;
          modelsDevProviderIds?: Array<string>;
          reasoning?: boolean;
          structuredOutput?: boolean;
          toolCall?: boolean;
          type?: string | null;
        },
        {
          isComplete: boolean;
          models: Array<{
            _creationTime: number;
            _id: string;
            attachment: boolean;
            contentHash: string;
            contextTokens: number;
            costBlended?: number;
            costCacheRead?: number;
            costCacheWrite?: number;
            costInput?: number;
            costInputAudio?: number;
            costOrder: number;
            costOutput?: number;
            costOutputAudio?: number;
            costReasoning?: number;
            description?: string;
            family?: string;
            firstSeenAt: number;
            hasCost: boolean;
            inputMask: number;
            interleaved?: true | { field: string };
            knowledge?: string;
            lastUpdated: string;
            limit: { context: number; input?: number; output: number };
            modelsDevCanonicalModelId?: string;
            modelsDevModelId: string;
            modelsDevProviderId: string;
            modes?: Record<
              string,
              {
                cost?: {
                  cacheRead?: number;
                  cacheWrite?: number;
                  input?: number;
                  inputAudio?: number;
                  output?: number;
                  outputAudio?: number;
                  reasoning?: number;
                };
                tiers?: Array<{
                  cacheRead?: number;
                  cacheWrite?: number;
                  input?: number;
                  inputAudio?: number;
                  output?: number;
                  outputAudio?: number;
                  reasoning?: number;
                  size: number;
                }>;
              }
            >;
            name: string;
            openWeights: boolean;
            outputMask: number;
            providerOverride?: { api?: string; npm?: string; shape?: string };
            reasoning: boolean;
            reasoningOptions?: Array<
              | { type: "toggle" }
              | { type: "effort"; values: Array<null | string> }
              | { max?: number; min?: number; type: "budget_tokens" }
            >;
            releaseDate: string;
            searchText: string;
            status?: "alpha" | "beta" | "deprecated";
            structuredOutput?: boolean;
            temperature?: boolean;
            tiers?: Array<{
              cacheRead?: number;
              cacheWrite?: number;
              input?: number;
              inputAudio?: number;
              output?: number;
              outputAudio?: number;
              reasoning?: number;
              size: number;
            }>;
            toolCall: boolean;
            type?: string;
            updatedAt: number;
          }>;
        },
        Name
      >;
      listEquivalents: FunctionReference<
        "query",
        "internal",
        { limit?: number; modelsDevCanonicalModelId: string },
        Array<{
          _creationTime: number;
          _id: string;
          attachment: boolean;
          contentHash: string;
          contextTokens: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOrder: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          limit: { context: number; input?: number; output: number };
          modelsDevCanonicalModelId?: string;
          modelsDevModelId: string;
          modelsDevProviderId: string;
          modes?: Record<
            string,
            {
              cost?: {
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
              };
              tiers?: Array<{
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
                size: number;
              }>;
            }
          >;
          name: string;
          openWeights: boolean;
          outputMask: number;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: "alpha" | "beta" | "deprecated";
          structuredOutput?: boolean;
          temperature?: boolean;
          tiers?: Array<{
            cacheRead?: number;
            cacheWrite?: number;
            input?: number;
            inputAudio?: number;
            output?: number;
            outputAudio?: number;
            reasoning?: number;
            size: number;
          }>;
          toolCall: boolean;
          type?: string;
          updatedAt: number;
        }>,
        Name
      >;
      listPriceChanges: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          modelsDevModelId: string;
          modelsDevProviderId: string;
        },
        Array<{
          _creationTime: number;
          _id: string;
          after?: {
            cacheRead?: number;
            cacheWrite?: number;
            input?: number;
            inputAudio?: number;
            modes?: Record<
              string,
              {
                cost?: {
                  cacheRead?: number;
                  cacheWrite?: number;
                  input?: number;
                  inputAudio?: number;
                  output?: number;
                  outputAudio?: number;
                  reasoning?: number;
                };
                tiers?: Array<{
                  cacheRead?: number;
                  cacheWrite?: number;
                  input?: number;
                  inputAudio?: number;
                  output?: number;
                  outputAudio?: number;
                  reasoning?: number;
                  size: number;
                }>;
              }
            >;
            output?: number;
            outputAudio?: number;
            reasoning?: number;
            tiers?: Array<{
              cacheRead?: number;
              cacheWrite?: number;
              input?: number;
              inputAudio?: number;
              output?: number;
              outputAudio?: number;
              reasoning?: number;
              size: number;
            }>;
          };
          before?: {
            cacheRead?: number;
            cacheWrite?: number;
            input?: number;
            inputAudio?: number;
            modes?: Record<
              string,
              {
                cost?: {
                  cacheRead?: number;
                  cacheWrite?: number;
                  input?: number;
                  inputAudio?: number;
                  output?: number;
                  outputAudio?: number;
                  reasoning?: number;
                };
                tiers?: Array<{
                  cacheRead?: number;
                  cacheWrite?: number;
                  input?: number;
                  inputAudio?: number;
                  output?: number;
                  outputAudio?: number;
                  reasoning?: number;
                  size: number;
                }>;
              }
            >;
            output?: number;
            outputAudio?: number;
            reasoning?: number;
            tiers?: Array<{
              cacheRead?: number;
              cacheWrite?: number;
              input?: number;
              inputAudio?: number;
              output?: number;
              outputAudio?: number;
              reasoning?: number;
              size: number;
            }>;
          };
          changedAt: number;
          kind: "added" | "removed" | "price" | "tiers";
          modelsDevModelId: string;
          modelsDevProviderId: string;
        }>,
        Name
      >;
      resolve: FunctionReference<
        "query",
        "internal",
        { aliases?: Record<string, string>; model: string; provider: string },
        {
          _creationTime: number;
          _id: string;
          attachment: boolean;
          contentHash: string;
          contextTokens: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOrder: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          limit: { context: number; input?: number; output: number };
          modelsDevCanonicalModelId?: string;
          modelsDevModelId: string;
          modelsDevProviderId: string;
          modes?: Record<
            string,
            {
              cost?: {
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
              };
              tiers?: Array<{
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
                size: number;
              }>;
            }
          >;
          name: string;
          openWeights: boolean;
          outputMask: number;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: "alpha" | "beta" | "deprecated";
          structuredOutput?: boolean;
          temperature?: boolean;
          tiers?: Array<{
            cacheRead?: number;
            cacheWrite?: number;
            input?: number;
            inputAudio?: number;
            output?: number;
            outputAudio?: number;
            reasoning?: number;
            size: number;
          }>;
          toolCall: boolean;
          type?: string;
          updatedAt: number;
        } | null,
        Name
      >;
      search: FunctionReference<
        "query",
        "internal",
        {
          family?: string;
          limit?: number;
          modelsDevProviderId?: string;
          query: string;
        },
        Array<{
          _creationTime: number;
          _id: string;
          attachment: boolean;
          contentHash: string;
          contextTokens: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOrder: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          limit: { context: number; input?: number; output: number };
          modelsDevCanonicalModelId?: string;
          modelsDevModelId: string;
          modelsDevProviderId: string;
          modes?: Record<
            string,
            {
              cost?: {
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
              };
              tiers?: Array<{
                cacheRead?: number;
                cacheWrite?: number;
                input?: number;
                inputAudio?: number;
                output?: number;
                outputAudio?: number;
                reasoning?: number;
                size: number;
              }>;
            }
          >;
          name: string;
          openWeights: boolean;
          outputMask: number;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: "alpha" | "beta" | "deprecated";
          structuredOutput?: boolean;
          temperature?: boolean;
          tiers?: Array<{
            cacheRead?: number;
            cacheWrite?: number;
            input?: number;
            inputAudio?: number;
            output?: number;
            outputAudio?: number;
            reasoning?: number;
            size: number;
          }>;
          toolCall: boolean;
          type?: string;
          updatedAt: number;
        }>,
        Name
      >;
    };
    providers: {
      get: FunctionReference<
        "query",
        "internal",
        { modelsDevProviderId: string },
        {
          _creationTime: number;
          _id: string;
          api?: string;
          contentHash: string;
          doc?: string;
          env: Array<string>;
          modelCount: number;
          modelsDevProviderId: string;
          name: string;
          npm?: string;
          updatedAt: number;
        } | null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          _creationTime: number;
          _id: string;
          api?: string;
          contentHash: string;
          doc?: string;
          env: Array<string>;
          modelCount: number;
          modelsDevProviderId: string;
          name: string;
          npm?: string;
          updatedAt: number;
        }>,
        Name
      >;
    };
    sync: {
      getStatus: FunctionReference<
        "query",
        "internal",
        {},
        {
          added: number;
          durationMs: number;
          errors: Array<{
            code:
              | "MODELS_DEV_INVALID_ARGUMENT"
              | "MODELS_DEV_PROVIDER_ERROR"
              | "MODELS_DEV_NETWORK_ERROR"
              | "MODELS_DEV_INVALID_RESPONSE"
              | "MODELS_DEV_CATALOG_TOO_SMALL"
              | "MODELS_DEV_CATALOG_TOO_LARGE"
              | "MODELS_DEV_SYNC_FAILED"
              | "MODELS_DEV_LEASE_LOST";
            message: string;
            providerCode?: string;
            providerStatus?: number;
            retryable?: boolean;
            source: "primary" | "fallback";
          }>;
          lastCheckedAt?: number;
          lastStatus?: "ok" | "not_modified" | "partial" | "error";
          lastSyncedAt?: number;
          leaseExpiresAt?: number;
          modelCount: number;
          partialReason?: "price_loss" | "removal";
          priceChanges: number;
          providerCount: number;
          removed: number;
          running: boolean;
          skippedModels: number;
          sourceUrl?: string;
          state: "never_synced" | "ok" | "error";
          updated: number;
        },
        Name
      >;
      run: FunctionReference<
        "action",
        "internal",
        {},
        {
          added?: number;
          durationMs?: number;
          errors: Array<{
            code:
              | "MODELS_DEV_INVALID_ARGUMENT"
              | "MODELS_DEV_PROVIDER_ERROR"
              | "MODELS_DEV_NETWORK_ERROR"
              | "MODELS_DEV_INVALID_RESPONSE"
              | "MODELS_DEV_CATALOG_TOO_SMALL"
              | "MODELS_DEV_CATALOG_TOO_LARGE"
              | "MODELS_DEV_SYNC_FAILED"
              | "MODELS_DEV_LEASE_LOST";
            message: string;
            providerCode?: string;
            providerStatus?: number;
            retryable?: boolean;
            source: "primary" | "fallback";
          }>;
          modelCount?: number;
          partialReason?: "price_loss" | "removal";
          priceChanges?: number;
          providerCount?: number;
          reason?: "disabled" | "min_interval" | "already_running";
          removed?: number;
          skippedModels?: number;
          sourceUrl?: string;
          status: "ok" | "not_modified" | "partial" | "error" | "skipped";
          updated?: number;
        },
        Name
      >;
      runForced: FunctionReference<
        "action",
        "internal",
        {},
        {
          added?: number;
          durationMs?: number;
          errors: Array<{
            code:
              | "MODELS_DEV_INVALID_ARGUMENT"
              | "MODELS_DEV_PROVIDER_ERROR"
              | "MODELS_DEV_NETWORK_ERROR"
              | "MODELS_DEV_INVALID_RESPONSE"
              | "MODELS_DEV_CATALOG_TOO_SMALL"
              | "MODELS_DEV_CATALOG_TOO_LARGE"
              | "MODELS_DEV_SYNC_FAILED"
              | "MODELS_DEV_LEASE_LOST";
            message: string;
            providerCode?: string;
            providerStatus?: number;
            retryable?: boolean;
            source: "primary" | "fallback";
          }>;
          modelCount?: number;
          partialReason?: "price_loss" | "removal";
          priceChanges?: number;
          providerCount?: number;
          reason?: "disabled" | "min_interval" | "already_running";
          removed?: number;
          skippedModels?: number;
          sourceUrl?: string;
          status: "ok" | "not_modified" | "partial" | "error" | "skipped";
          updated?: number;
        },
        Name
      >;
    };
  };
