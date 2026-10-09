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
      configure: FunctionReference<
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
    };
    models: {
      cheapest: FunctionReference<
        "query",
        "internal",
        {
          distinctCanonical?: boolean;
          excludeDeprecated?: boolean;
          excludeFree?: boolean;
          inputModalities?: Array<string>;
          limit?: number;
          minContext?: number;
          minOutput?: number;
          providerIds?: Array<string>;
          reasoning?: boolean;
          structuredOutput?: boolean;
          toolCall?: boolean;
        },
        Array<{
          _creationTime: number;
          _id: string;
          attachment: boolean;
          canonicalModelId?: string;
          contentHash: string;
          contextLimit: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputLimit?: number;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          modelId: string;
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
          outputLimit: number;
          outputMask: number;
          providerId: string;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: string;
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
          updatedAt: number;
        }>,
        Name
      >;
      equivalents: FunctionReference<
        "query",
        "internal",
        { canonicalModelId: string; limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          attachment: boolean;
          canonicalModelId?: string;
          contentHash: string;
          contextLimit: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputLimit?: number;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          modelId: string;
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
          outputLimit: number;
          outputMask: number;
          providerId: string;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: string;
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
          updatedAt: number;
        }>,
        Name
      >;
      estimate: FunctionReference<
        "query",
        "internal",
        {
          aliases?: Record<string, string>;
          inputIncludesCache?: boolean;
          mode?: string;
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
        { modelId: string; providerId: string },
        {
          _creationTime: number;
          _id: string;
          attachment: boolean;
          canonicalModelId?: string;
          contentHash: string;
          contextLimit: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputLimit?: number;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          modelId: string;
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
          outputLimit: number;
          outputMask: number;
          providerId: string;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: string;
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
          canonicalModelId?: string;
          contentHash: string;
          contextLimit: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputLimit?: number;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          modelId: string;
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
          outputLimit: number;
          outputMask: number;
          providerId: string;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: string;
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
          minContext?: number;
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
          providerId?: string;
          reasoning?: boolean;
          status?: string;
          structuredOutput?: boolean;
          toolCall?: boolean;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            attachment: boolean;
            canonicalModelId?: string;
            contentHash: string;
            contextLimit: number;
            costBlended?: number;
            costCacheRead?: number;
            costCacheWrite?: number;
            costInput?: number;
            costInputAudio?: number;
            costOutput?: number;
            costOutputAudio?: number;
            costReasoning?: number;
            description?: string;
            family?: string;
            firstSeenAt: number;
            hasCost: boolean;
            inputLimit?: number;
            inputMask: number;
            interleaved?: true | { field: string };
            knowledge?: string;
            lastUpdated: string;
            modelId: string;
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
            outputLimit: number;
            outputMask: number;
            providerId: string;
            providerOverride?: { api?: string; npm?: string; shape?: string };
            reasoning: boolean;
            reasoningOptions?: Array<
              | { type: "toggle" }
              | { type: "effort"; values: Array<null | string> }
              | { max?: number; min?: number; type: "budget_tokens" }
            >;
            releaseDate: string;
            searchText: string;
            status?: string;
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
            updatedAt: number;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      priceHistory: FunctionReference<
        "query",
        "internal",
        { limit?: number; modelId: string; providerId: string },
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
          at: number;
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
          kind: "added" | "removed" | "price" | "tiers";
          modelId: string;
          providerId: string;
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
          canonicalModelId?: string;
          contentHash: string;
          contextLimit: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputLimit?: number;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          modelId: string;
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
          outputLimit: number;
          outputMask: number;
          providerId: string;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: string;
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
          updatedAt: number;
        } | null,
        Name
      >;
      search: FunctionReference<
        "query",
        "internal",
        { family?: string; limit?: number; providerId?: string; query: string },
        Array<{
          _creationTime: number;
          _id: string;
          attachment: boolean;
          canonicalModelId?: string;
          contentHash: string;
          contextLimit: number;
          costBlended?: number;
          costCacheRead?: number;
          costCacheWrite?: number;
          costInput?: number;
          costInputAudio?: number;
          costOutput?: number;
          costOutputAudio?: number;
          costReasoning?: number;
          description?: string;
          family?: string;
          firstSeenAt: number;
          hasCost: boolean;
          inputLimit?: number;
          inputMask: number;
          interleaved?: true | { field: string };
          knowledge?: string;
          lastUpdated: string;
          modelId: string;
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
          outputLimit: number;
          outputMask: number;
          providerId: string;
          providerOverride?: { api?: string; npm?: string; shape?: string };
          reasoning: boolean;
          reasoningOptions?: Array<
            | { type: "toggle" }
            | { type: "effort"; values: Array<null | string> }
            | { max?: number; min?: number; type: "budget_tokens" }
          >;
          releaseDate: string;
          searchText: string;
          status?: string;
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
          updatedAt: number;
        }>,
        Name
      >;
    };
    providers: {
      get: FunctionReference<
        "query",
        "internal",
        { providerId: string },
        {
          _creationTime: number;
          _id: string;
          api?: string;
          contentHash: string;
          doc?: string;
          env: Array<string>;
          modelCount: number;
          name: string;
          npm?: string;
          providerId: string;
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
          name: string;
          npm?: string;
          providerId: string;
          updatedAt: number;
        }>,
        Name
      >;
    };
    sync: {
      status: FunctionReference<
        "query",
        "internal",
        {},
        {
          added: number;
          durationMs: number;
          lastCheckedAt?: number;
          lastError?: string;
          lastStatus?: "ok" | "not_modified" | "partial" | "error";
          lastSyncedAt?: number;
          leaseExpiresAt?: number;
          modelCount: number;
          priceChanges: number;
          providerCount: number;
          removalSkipped: boolean;
          removed: number;
          running: boolean;
          skippedModels: number;
          source?: string;
          state: "never_synced" | "ok" | "error";
          updated: number;
        },
        Name
      >;
      syncNow: FunctionReference<
        "action",
        "internal",
        { force?: boolean },
        {
          added?: number;
          durationMs?: number;
          modelCount?: number;
          priceChanges?: number;
          providerCount?: number;
          reason?: string;
          removalSkipped?: boolean;
          removed?: number;
          skippedModels?: number;
          source?: string;
          status: "ok" | "not_modified" | "partial" | "error" | "skipped";
          updated?: number;
        },
        Name
      >;
    };
  };
