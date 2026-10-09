import { modelsDevError } from "./errors.js";
import { isRecord } from "./guards.js";
import type {
  ModelRow,
  PriceFields,
  PriceTier,
  PricingSnapshot,
  ProviderRow,
} from "./validators.js";

const MODALITY_BITS: Record<string, number> = { text: 1, audio: 2, image: 4, video: 8, pdf: 16 };
const MODE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function modalityMask(modalities: readonly string[]): number {
  let mask = 0;
  for (const modality of modalities) mask |= MODALITY_BITS[modality] ?? 0;
  return mask;
}

class Invalid extends Error {}

type Obj = Record<string, unknown>;

function reqString(o: Obj, key: string): string {
  const value = o[key];
  if (typeof value !== "string") throw new Invalid(key);
  return value;
}

function optString(o: Obj, key: string): string | undefined {
  const value = o[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Invalid(key);
  return value;
}

function reqBool(o: Obj, key: string): boolean {
  const value = o[key];
  if (typeof value !== "boolean") throw new Invalid(key);
  return value;
}

function optBool(o: Obj, key: string): boolean | undefined {
  const value = o[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Invalid(key);
  return value;
}

function num(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Invalid(key);
  return value;
}

function optNum(o: Obj, key: string): number | undefined {
  const value = o[key];
  if (value === undefined || value === null) return undefined;
  return num(value, key);
}

function strings(value: unknown, key: string): string[] {
  if (!Array.isArray(value)) throw new Invalid(key);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new Invalid(key);
    out.push(item);
  }
  return out;
}

function priceFields(o: Obj): PriceFields {
  const out: PriceFields = {};
  const map: [string, keyof PriceFields][] = [
    ["input", "input"],
    ["output", "output"],
    ["cache_read", "cacheRead"],
    ["cache_write", "cacheWrite"],
    ["reasoning", "reasoning"],
    ["input_audio", "inputAudio"],
    ["output_audio", "outputAudio"],
  ];
  for (const [from, to] of map) {
    const value = optNum(o, from);
    if (value !== undefined) out[to] = value;
  }
  return out;
}

function parseTiers(cost: Obj): PriceTier[] | undefined {
  const raw = cost.tiers;
  if (raw !== undefined) {
    if (!Array.isArray(raw)) throw new Invalid("tiers");
    const tiers: PriceTier[] = [];
    for (const entry of raw) {
      if (!isRecord(entry)) throw new Invalid("tiers");
      const tier = entry.tier;
      if (!isRecord(tier) || tier.type !== "context") continue;
      tiers.push({ size: num(tier.size, "tier.size"), ...priceFields(entry) });
    }
    tiers.sort((a, b) => a.size - b.size);
    return tiers;
  }
  const legacy = cost.context_over_200k;
  if (isRecord(legacy)) return [{ size: 200_000, ...priceFields(legacy) }];
  return undefined;
}

function parseReasoningOptions(raw: unknown): ModelRow["reasoningOptions"] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<ModelRow["reasoningOptions"]> = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    if (entry.type === "toggle") out.push({ type: "toggle" });
    else if (entry.type === "effort" && Array.isArray(entry.values)) {
      out.push({
        type: "effort",
        values: entry.values.filter(
          (value): value is string | null => value === null || typeof value === "string",
        ),
      });
    } else if (entry.type === "budget_tokens") {
      const min = typeof entry.min === "number" ? entry.min : undefined;
      const max = typeof entry.max === "number" ? entry.max : undefined;
      out.push({
        type: "budget_tokens",
        ...(min !== undefined && { min }),
        ...(max !== undefined && { max }),
      });
    }
  }
  return out;
}

function parseModes(raw: unknown): ModelRow["modes"] {
  if (!isRecord(raw)) return undefined;
  const out: NonNullable<ModelRow["modes"]> = {};
  for (const [name, mode] of Object.entries(raw)) {
    if (!MODE_NAME.test(name) || !isRecord(mode) || !isRecord(mode.cost)) continue;
    const tiers = Array.isArray(mode.cost.tiers) ? parseTiers(mode.cost) : undefined;
    out[name] = { cost: priceFields(mode.cost), ...(tiers && { tiers }) };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Validates and flattens one upstream model. Returns null when the entry is
 * structurally unusable; unknown fields are ignored.
 */
export function normalizeModel(providerId: string, modelId: string, raw: unknown): ModelRow | null {
  if (!isRecord(raw)) return null;
  try {
    const name = reqString(raw, "name");
    const limit = raw.limit;
    const modalities = raw.modalities;
    if (!isRecord(limit) || !isRecord(modalities)) throw new Invalid("limit");
    const inputModalities = strings(modalities.input, "modalities.input");
    const outputModalities = strings(modalities.output, "modalities.output");
    const family = optString(raw, "family");

    const row: ModelRow = {
      providerId,
      modelId,
      name,
      searchText: `${name} ${modelId} ${family ?? ""} ${providerId}`.toLowerCase(),
      attachment: reqBool(raw, "attachment"),
      reasoning: reqBool(raw, "reasoning"),
      toolCall: reqBool(raw, "tool_call"),
      openWeights: reqBool(raw, "open_weights"),
      inputMask: modalityMask(inputModalities),
      outputMask: modalityMask(outputModalities),
      contextLimit: num(limit.context, "limit.context"),
      outputLimit: num(limit.output, "limit.output"),
      releaseDate: reqString(raw, "release_date"),
      lastUpdated: reqString(raw, "last_updated"),
      hasCost: false,
    };
    const assign = <K extends keyof ModelRow>(key: K, value: ModelRow[K] | undefined) => {
      if (value !== undefined) row[key] = value;
    };
    assign("canonicalModelId", optString(raw, "canonical_model_id"));
    assign("family", family);
    assign("description", optString(raw, "description"));
    assign("structuredOutput", optBool(raw, "structured_output"));
    assign("temperature", optBool(raw, "temperature"));
    assign("status", optString(raw, "status"));
    assign("knowledge", optString(raw, "knowledge"));
    assign("inputLimit", optNum(limit, "input"));
    assign("reasoningOptions", parseReasoningOptions(raw.reasoning_options));
    if (raw.interleaved === true) row.interleaved = true;
    else if (isRecord(raw.interleaved) && typeof raw.interleaved.field === "string") {
      row.interleaved = { field: raw.interleaved.field };
    }

    if (isRecord(raw.cost)) {
      const cost = priceFields(raw.cost);
      if (cost.input === undefined || cost.output === undefined) throw new Invalid("cost");
      row.hasCost = true;
      row.costInput = cost.input;
      row.costOutput = cost.output;
      assign("costCacheRead", cost.cacheRead);
      assign("costCacheWrite", cost.cacheWrite);
      assign("costReasoning", cost.reasoning);
      assign("costInputAudio", cost.inputAudio);
      assign("costOutputAudio", cost.outputAudio);
      row.costBlended = (3 * cost.input + cost.output) / 4;
      assign("tiers", parseTiers(raw.cost));
    }

    const experimental = raw.experimental;
    if (isRecord(experimental)) assign("modes", parseModes(experimental.modes));

    const provider = raw.provider;
    if (isRecord(provider)) {
      const override: NonNullable<ModelRow["providerOverride"]> = {};
      if (typeof provider.npm === "string") override.npm = provider.npm;
      if (typeof provider.api === "string") override.api = provider.api;
      if (typeof provider.shape === "string") override.shape = provider.shape;
      if (Object.keys(override).length > 0) row.providerOverride = override;
    }
    return row;
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

export function normalizeProvider(
  providerId: string,
  raw: unknown,
  modelCount: number,
): ProviderRow | null {
  if (!isRecord(raw)) return null;
  const row: ProviderRow = {
    providerId,
    name: typeof raw.name === "string" ? raw.name : providerId,
    env: Array.isArray(raw.env)
      ? raw.env.filter((item): item is string => typeof item === "string")
      : [],
    modelCount,
  };
  if (typeof raw.npm === "string") row.npm = raw.npm;
  if (typeof raw.doc === "string") row.doc = raw.doc;
  if (typeof raw.api === "string") row.api = raw.api;
  return row;
}

/** Counts of usable (validated) providers and models, plus models that failed validation. */
export type CatalogShape = { providerCount: number; modelCount: number; skippedModels: number };

/**
 * Validates the top level (throws unless it is a provider map) and counts the usable
 * rows: models that normalize, and providers with at least one such model.
 */
export function inspectCatalog(raw: unknown): CatalogShape {
  if (!isRecord(raw)) throw new Error("catalog is not an object");
  let providerCount = 0;
  let modelCount = 0;
  let skippedModels = 0;
  for (const [providerId, provider] of Object.entries(raw)) {
    // A malformed provider must abort the sync before any write: skipping it would let the
    // removal pass delete that provider's stored rows.
    if (!isRecord(provider) || !isRecord(provider.models)) {
      throw modelsDevError(
        "MODELS_DEV_INVALID_CATALOG",
        `provider "${providerId}" has no models object; refusing to sync`,
      );
    }
    let usable = 0;
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (normalizeModel(providerId, modelId, model)) usable++;
      else skippedModels++;
    }
    if (usable > 0) providerCount++;
    modelCount += usable;
  }
  return { providerCount, modelCount, skippedModels };
}

/** The pricing portion of a stored row, for change detection and history. */
export function pricingOf(row: ModelRow | undefined | null): PricingSnapshot | undefined {
  if (!row || (!row.hasCost && !row.modes)) return undefined;
  const out: PricingSnapshot = {};
  const keys = [
    ["input", "costInput"],
    ["output", "costOutput"],
    ["cacheRead", "costCacheRead"],
    ["cacheWrite", "costCacheWrite"],
    ["reasoning", "costReasoning"],
    ["inputAudio", "costInputAudio"],
    ["outputAudio", "costOutputAudio"],
  ] as const;
  for (const [to, from] of keys) {
    const value = row[from];
    if (value !== undefined) out[to] = value;
  }
  if (row.tiers) out.tiers = row.tiers;
  if (row.modes) out.modes = row.modes;
  return out;
}
