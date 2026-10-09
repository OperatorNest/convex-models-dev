import { isRecord } from "./guards.js";
import type {
  CostBreakdown,
  CostEstimate,
  ModelRow,
  PriceFields,
  PriceTier,
  UsageInput,
} from "./validators.js";

/** The pricing subset of a stored model row. */
export type CostModel = Pick<
  ModelRow,
  | "costInput"
  | "costOutput"
  | "costCacheRead"
  | "costCacheWrite"
  | "costReasoning"
  | "costInputAudio"
  | "costOutputAudio"
  | "tiers"
  | "modes"
> & {
  /** When the stored price was last written; echoed as `priceSnapshotAt`. */
  updatedAt?: number;
};

export type EstimateCostOptions = {
  /** An `experimental.modes` key such as "fast" or "flex". */
  mode?: string;
  /** Whether `inputTokens` already includes cache tokens. Default true. */
  inputIncludesCache?: boolean;
};

const UNKNOWN: CostEstimate = { known: false };

const PRICE_KEYS: (keyof PriceFields)[] = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "reasoning",
  "inputAudio",
  "outputAudio",
];

function tokens(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function defined(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function storedPrices(model: CostModel): PriceFields {
  const out: PriceFields = {};
  const columns = [
    ["input", model.costInput],
    ["output", model.costOutput],
    ["cacheRead", model.costCacheRead],
    ["cacheWrite", model.costCacheWrite],
    ["reasoning", model.costReasoning],
    ["inputAudio", model.costInputAudio],
    ["outputAudio", model.costOutputAudio],
  ] as const;
  for (const [key, value] of columns) {
    const price = defined(value);
    if (price !== undefined) out[key] = price;
  }
  return out;
}

/** Layers `over` on `base`; fields `over` omits fall through. */
function overlay(base: PriceFields, over: PriceFields | undefined): PriceFields {
  if (!over) return base;
  const out: PriceFields = { ...base };
  for (const key of PRICE_KEYS) {
    const value = defined(over[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function selectTier(tiers: PriceTier[] | undefined, prompt: number): PriceTier | undefined {
  let picked: PriceTier | undefined;
  for (const tier of tiers ?? []) {
    if (typeof tier.size !== "number") continue;
    // models.dev writes "starts at N" thresholds as N+1 (e.g. 200001).
    const crossed = tier.size % 1000 === 1 ? prompt >= tier.size : prompt > tier.size;
    if (crossed && (!picked || tier.size > picked.size)) picked = tier;
  }
  return picked;
}

/** tokens * (USD per 1M) in integer nano-USD, rounded once. */
function nano(count: number, pricePerMillion: number): number {
  return Math.round(count * pricePerMillion * 1e3);
}

/**
 * Estimates the USD cost of one request from stored models.dev pricing.
 * Works in integer nano-USD, and returns `{ known: false }` (never 0) when the
 * model has no usable input/output price.
 */
export function estimateCost(
  model: CostModel,
  usage: UsageInput,
  opts: EstimateCostOptions = {},
): CostEstimate {
  const cacheRead = tokens(usage.cacheReadTokens ?? usage.cachedInputTokens);
  const cacheWrite = tokens(usage.cacheWriteTokens ?? usage.cacheWriteInputTokens);
  const inputAudio = tokens(usage.inputAudioTokens);
  const outputAudio = tokens(usage.outputAudioTokens);
  const explicitNoCache = usage.noCacheTokens ?? usage.nonCachedInputTokens;
  const noCache = tokens(explicitNoCache);

  const reported = usage.inputTokens ?? usage.promptTokens;
  let prompt = reported === undefined ? noCache + cacheRead + cacheWrite : tokens(reported);
  if (opts.inputIncludesCache === false && reported !== undefined) {
    prompt = tokens(reported) + cacheRead + cacheWrite;
  }
  const uncachedInput =
    explicitNoCache !== undefined
      ? noCache
      : Math.max(0, prompt - cacheRead - cacheWrite - inputAudio);

  const reasoning = tokens(usage.reasoningTokens);
  const reportedOutput = usage.outputTokens ?? usage.completionTokens;
  const text =
    reportedOutput === undefined && usage.textOutputTokens !== undefined
      ? tokens(usage.textOutputTokens)
      : Math.max(0, tokens(reportedOutput) - reasoning - outputAudio);

  let table = storedPrices(model);

  const assumptions: string[] = [];
  const base = table;
  let mode: string | null = null;
  const modeEntry = opts.mode !== undefined ? model.modes?.[opts.mode] : undefined;
  if (opts.mode !== undefined && modeEntry?.cost) {
    table = overlay(table, modeEntry.cost);
    mode = opts.mode;
  }

  let tierSize: number | null = null;
  if (mode !== null && modeEntry?.tiers) {
    // The mode defines its own tiers: they apply on top of the mode price.
    const modeTier = selectTier(modeEntry.tiers, prompt);
    if (modeTier) {
      table = overlay(table, modeTier);
      tierSize = modeTier.size;
    }
  } else {
    const tier = selectTier(model.tiers, prompt);
    if (tier) {
      tierSize = tier.size;
      if (mode === null) table = overlay(table, tier);
      else {
        // Mode pricing wins: a base tier may raise, but never lower, the mode's rate.
        const tierTable = overlay(base, tier);
        const merged: PriceFields = {};
        for (const key of PRICE_KEYS) {
          const value = Math.max(table[key] ?? -1, tierTable[key] ?? -1);
          if (value >= 0) merged[key] = value;
        }
        table = merged;
        assumptions.push("mode_without_tiers: used max(mode, base tier) per field");
      }
    }
  }

  const input = table.input;
  const output = table.output;
  if (input === undefined || output === undefined) return UNKNOWN;

  const rate = (
    value: number | undefined,
    fallback: { name: string; price: number },
    name: string,
    used: number,
  ) => {
    if (value !== undefined) return value;
    if (used > 0) assumptions.push(`${name} priced at the ${fallback.name} rate (no listed price)`);
    return fallback.price;
  };
  const asInput = { name: "input", price: input };
  const asOutput = { name: "output", price: output };
  const cacheReadRate = rate(table.cacheRead, asInput, "cacheRead", cacheRead);
  const cacheWriteRate = rate(table.cacheWrite, asInput, "cacheWrite", cacheWrite);
  const reasoningRate = rate(table.reasoning, asOutput, "reasoning", reasoning);
  const inputAudioRate = rate(table.inputAudio, asInput, "inputAudio", inputAudio);
  const outputAudioRate = rate(table.outputAudio, asOutput, "outputAudio", outputAudio);

  const terms: CostBreakdown = {
    uncachedInput: nano(uncachedInput, input),
    cacheRead: nano(cacheRead, cacheReadRate),
    cacheWrite: nano(cacheWrite, cacheWriteRate),
    inputAudio: nano(inputAudio, inputAudioRate),
    text: nano(text, output),
    reasoning: nano(reasoning, reasoningRate),
    outputAudio: nano(outputAudio, outputAudioRate),
  };
  const nanoUsd = Object.values(terms).reduce((sum, term) => sum + term, 0);
  const breakdown: CostBreakdown = {
    uncachedInput: terms.uncachedInput / 1e9,
    cacheRead: terms.cacheRead / 1e9,
    cacheWrite: terms.cacheWrite / 1e9,
    inputAudio: terms.inputAudio / 1e9,
    text: terms.text / 1e9,
    reasoning: terms.reasoning / 1e9,
    outputAudio: terms.outputAudio / 1e9,
  };

  return {
    known: true,
    usd: nanoUsd / 1e9,
    nanoUsd,
    breakdown,
    tier: tierSize,
    mode,
    assumptions,
    priceSnapshotAt: model.updatedAt ?? null,
  };
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/**
 * Maps `@convex-dev/agent` / AI SDK usage (v5, v6 and v7 spellings) plus
 * optional `providerMetadata` to a {@link UsageInput}. Provider metadata only
 * fills cache fields that `usage` lacks.
 */
export function usageFromAgent(args: { usage?: unknown; providerMetadata?: unknown }): UsageInput {
  const usage = obj(args.usage) ?? {};
  const inputDetails = obj(usage.inputTokenDetails) ?? {};
  const outputDetails = obj(usage.outputTokenDetails) ?? {};
  const meta = obj(args.providerMetadata) ?? {};
  const anthropic = obj(meta.anthropic) ?? {};
  const anthropicUsage = obj(anthropic.usage) ?? {};
  const openai = obj(meta.openai) ?? {};

  const out: UsageInput = {};
  const set = (key: keyof UsageInput, ...candidates: unknown[]) => {
    for (const candidate of candidates) {
      const value = num(candidate);
      if (value !== undefined) {
        out[key] = value;
        return;
      }
    }
  };

  set("inputTokens", usage.inputTokens, usage.promptTokens);
  set("outputTokens", usage.outputTokens, usage.completionTokens);
  set(
    "cacheReadTokens",
    inputDetails.cacheReadTokens,
    usage.cachedInputTokens,
    usage.cacheReadTokens,
    openai.cachedPromptTokens,
    anthropicUsage.cache_read_input_tokens,
  );
  set(
    "cacheWriteTokens",
    inputDetails.cacheWriteTokens,
    usage.cacheWriteTokens,
    usage.cacheWriteInputTokens,
    anthropic.cacheCreationInputTokens,
    anthropicUsage.cache_creation_input_tokens,
  );
  set("noCacheTokens", inputDetails.noCacheTokens, usage.noCacheTokens, usage.nonCachedInputTokens);
  set("reasoningTokens", outputDetails.reasoningTokens, usage.reasoningTokens);
  set("textOutputTokens", outputDetails.textTokens);
  return out;
}
