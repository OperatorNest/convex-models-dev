import { modelsDevError } from "./errors.js";
import { isRecord } from "./guards.js";
import { jsonBytes, utf8Bytes } from "./bounds.js";
import type { ModelRow, CostFields, CostTier, PricingSnapshot, ProviderRow } from "./validators.js";

const MODALITY_BITS: Record<string, number> = { text: 1, audio: 2, image: 4, video: 8, pdf: 16 };
const MODE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function modalityMask(modalities: readonly string[]): number {
  let mask = 0;
  for (const modality of modalities) mask |= MODALITY_BITS[modality] ?? 0;
  return mask;
}

const INDEX_STRING_BYTES = 1024;
const INDEX_STRING_FIELDS = [
  "modelsDevProviderId",
  "modelsDevModelId",
  "family",
  "modelsDevCanonicalModelId",
  "releaseDate",
  "searchText",
] as const;

class Invalid extends Error {}

type Obj = Record<string, unknown>;

function validStored(value: unknown): boolean {
  if (typeof value === "string") return value.isWellFormed() && utf8Bytes(value) <= 16384;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 128 && value.every(validStored);
  if (isRecord(value))
    return (
      Object.entries(value).length <= 128 &&
      Object.entries(value).every(([key, field]) => validStored(key) && validStored(field))
    );
  return true;
}
export const MAX_MODEL_ROW_BYTES = 4096;
const MAX_PROVIDER_ROW_BYTES = 65536;
function rowFits(value: unknown, maxBytes: number): boolean {
  return validStored(value) && jsonBytes(value) <= maxBytes;
}
const DATE_SHAPE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

function date(o: Obj, key: string): string {
  const value = reqString(o, key);
  const match = DATE_SHAPE.exec(value);
  if (!match) throw new Invalid(key);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Invalid(key);
  if (match[3] === undefined) return value;
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 ? (leapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (day < 1 || day > daysInMonth) throw new Invalid(key);
  return value;
}
function reqString(o: Obj, key: string): string {
  const value = o[key];
  if (typeof value !== "string" || !validStored(value)) throw new Invalid(key);
  return value;
}

function optString(o: Obj, key: string): string | undefined {
  const value = o[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !validStored(value)) throw new Invalid(key);
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

function num(value: unknown, key: string, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) throw new Invalid(key);
  return value;
}

function optNum(o: Obj, key: string, min = 0): number | undefined {
  const value = o[key];
  if (value === undefined || value === null) return undefined;
  return num(value, key, min);
}

function strings(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.length > 128) throw new Invalid(key);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new Invalid(key);
    out.push(item);
  }
  return out;
}

function priceFields(o: Obj): CostFields {
  const out: CostFields = {};
  const map: [string, keyof CostFields][] = [
    ["input", "input"],
    ["output", "output"],
    ["cache_read", "cacheRead"],
    ["cache_write", "cacheWrite"],
    ["reasoning", "reasoning"],
    ["input_audio", "inputAudio"],
    ["output_audio", "outputAudio"],
  ];
  for (const [from, to] of map) {
    if (o[from] === null) throw new Invalid(from);
    const value = optNum(o, from);
    if (value !== undefined) out[to] = value;
  }
  return out;
}

function parseTiers(cost: Obj): CostTier[] | undefined {
  const raw = cost.tiers;
  if (raw !== undefined) {
    if (!Array.isArray(raw)) throw new Invalid("tiers");
    const tiers: CostTier[] = [];
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
  if (legacy !== undefined && !isRecord(legacy)) throw new Invalid("context_over_200k");
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
      const min = optNum(entry, "min", -1);
      const max = optNum(entry, "max");
      if (min !== undefined && max !== undefined && min > max) throw new Invalid("budget_tokens");
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
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Invalid("modes");
  const out: NonNullable<ModelRow["modes"]> = {};
  for (const [name, mode] of Object.entries(raw)) {
    if (!MODE_NAME.test(name)) continue;
    if (!isRecord(mode)) throw new Invalid("mode");
    if (mode.cost === undefined) continue;
    if (!isRecord(mode.cost)) throw new Invalid("mode");
    const tiers = parseTiers(mode.cost);
    out[name] = { cost: priceFields(mode.cost), ...(tiers && { tiers }) };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeModel(
  modelsDevProviderId: string,
  modelsDevModelId: string,
  raw: unknown,
): ModelRow | null {
  if (!isRecord(raw)) return null;
  try {
    const name = reqString(raw, "name");
    const limit = raw.limit;
    const modalities = raw.modalities;
    if (!isRecord(limit) || !isRecord(modalities)) throw new Invalid("limit");
    const inputModalities = strings(modalities.input, "modalities.input");
    const outputModalities = strings(modalities.output, "modalities.output");
    const family = optString(raw, "family");
    const context = num(limit.context, "limit.context");
    const input = optNum(limit, "input");

    const row: ModelRow = {
      modelsDevProviderId,
      modelsDevModelId,
      name,
      searchText:
        `${name} ${modelsDevModelId} ${family ?? ""} ${modelsDevProviderId}`.toLowerCase(),
      attachment: reqBool(raw, "attachment"),
      reasoning: reqBool(raw, "reasoning"),
      toolCall: reqBool(raw, "tool_call"),
      openWeights: reqBool(raw, "open_weights"),
      inputMask: modalityMask(inputModalities),
      outputMask: modalityMask(outputModalities),
      limit: {
        context,
        ...(input !== undefined && { input }),
        output: num(limit.output, "limit.output"),
      },
      contextTokens: context,
      releaseDate: date(raw, "release_date"),
      lastUpdated: date(raw, "last_updated"),
      hasCost: false,
      costOrder: 0,
    };
    const assign = <K extends keyof ModelRow>(key: K, value: ModelRow[K] | undefined) => {
      if (value !== undefined) row[key] = value;
    };
    assign("modelsDevCanonicalModelId", optString(raw, "canonical_model_id"));
    assign("type", optString(raw, "type"));
    assign("family", family);
    assign("description", optString(raw, "description"));
    assign("structuredOutput", optBool(raw, "structured_output"));
    assign("temperature", optBool(raw, "temperature"));
    assign("status", optString(raw, "status"));
    assign("knowledge", optString(raw, "knowledge"));
    assign("reasoningOptions", parseReasoningOptions(raw.reasoning_options));
    if (raw.interleaved === true) row.interleaved = true;
    else if (isRecord(raw.interleaved) && typeof raw.interleaved.field === "string") {
      row.interleaved = { field: raw.interleaved.field };
    }

    if (raw.cost !== undefined && !isRecord(raw.cost)) throw new Invalid("cost");
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
      row.costBlended = cost.input * 0.75 + cost.output * 0.25;
      row.costOrder = -row.costBlended;
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
    return rowFits(row, MAX_MODEL_ROW_BYTES) &&
      INDEX_STRING_FIELDS.every((field) => {
        const value = row[field];
        return value === undefined || utf8Bytes(value) <= INDEX_STRING_BYTES;
      })
      ? row
      : null;
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

export function normalizeProvider(
  modelsDevProviderId: string,
  raw: unknown,
  modelCount: number,
): ProviderRow | null {
  if (
    !isRecord(raw) ||
    !modelsDevProviderId.isWellFormed() ||
    utf8Bytes(modelsDevProviderId) > INDEX_STRING_BYTES
  )
    return null;
  try {
    const row: ProviderRow = {
      modelsDevProviderId,
      name: optString(raw, "name") ?? modelsDevProviderId,
      env: raw.env === undefined ? [] : strings(raw.env, "env"),
      modelCount,
    };
    for (const field of ["npm", "doc", "api"] as const) {
      const value = optString(raw, field);
      if (value !== undefined) row[field] = value;
    }
    return rowFits(row, MAX_PROVIDER_ROW_BYTES) ? row : null;
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

export type CatalogShape = {
  providerCount: number;
  modelCount: number;
  skippedModels: number;
  modelCountByProvider: Map<string, number>;
};

export function inspectCatalog(raw: unknown): CatalogShape {
  if (!isRecord(raw)) throw modelsDevError("MODELS_DEV_INVALID_RESPONSE");
  let providerCount = 0;
  let modelCount = 0;
  let skippedModels = 0;
  const modelCountByProvider = new Map<string, number>();
  for (const [modelsDevProviderId, provider] of Object.entries(raw)) {
    if (!isRecord(provider) || !isRecord(provider.models)) continue;
    if (!normalizeProvider(modelsDevProviderId, provider, 0)) {
      skippedModels += Object.keys(provider.models).length;
      continue;
    }
    let usable = 0;
    for (const [modelsDevModelId, model] of Object.entries(provider.models)) {
      if (normalizeModel(modelsDevProviderId, modelsDevModelId, model)) usable++;
      else skippedModels++;
    }
    modelCountByProvider.set(modelsDevProviderId, usable);
    if (usable > 0) providerCount++;
    modelCount += usable;
  }
  return { providerCount, modelCount, skippedModels, modelCountByProvider };
}

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
