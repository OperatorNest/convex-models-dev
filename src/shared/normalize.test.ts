import { expect, test, describe } from "vitest";

import {
  FIXTURE_MODEL_COUNT,
  FIXTURE_PROVIDER_COUNT,
  fixtureModel,
  fixtureCatalog,
  rawModel,
} from "../fixtures/index.js";
import {
  normalizeModel,
  normalizeProvider,
  inspectCatalog,
  modalityMask,
  pricingOf,
  MAX_MODEL_ROW_BYTES,
} from "./normalize.js";
import { jsonBytes } from "./bounds.js";

import { canonicalJson, rowHash, sha256Hex } from "./hash.js";

describe("normalizeModel", () => {
  test("flattens a tiered model with modes", () => {
    const row = fixtureModel("openai", "gpt-5.4");
    expect(row).toMatchObject({
      modelsDevProviderId: "openai",
      modelsDevModelId: "gpt-5.4",
      hasCost: true,
      costInput: 2.5,
      costOutput: 15,
      costCacheRead: 0.25,
      costBlended: (3 * 2.5 + 15) / 4,
      tiers: [{ size: 272_000, input: 5, output: 22.5, cacheRead: 0.5 }],
      modes: { fast: { cost: { input: 5, output: 30, cacheRead: 0.5 } } },
      toolCall: true,
    });
    expect(row.searchText).toBe(`${row.name} gpt-5.4 ${row.family} openai`.toLowerCase());
    expect(JSON.stringify(row)).not.toContain("service_tier");
  });

  test("models without cost have no price fields", () => {
    const row = fixtureModel("openai", "gpt-image-1-mini");
    expect(row.hasCost).toBe(false);
    expect(row.costInput).toBeUndefined();
    expect(row.costBlended).toBeUndefined();
  });

  test("zero cost stays zero, not missing", () => {
    const row = fixtureModel("google", "lyria-3-pro-preview");
    expect(row.hasCost).toBe(true);
    expect(row.costInput).toBe(0);
    expect(row.costBlended).toBe(0);
  });

  test("audio, cache write and reasoning prices carry over", () => {
    expect(fixtureModel("google", "gemini-3.5-flash").costInputAudio).toBe(1.5);
    expect(fixtureModel("anthropic", "claude-sonnet-4-5").costCacheWrite).toBe(3.75);
    expect(fixtureModel("deepseek", "deepseek-v4-flash-vision-exp").costReasoning).toBe(0.6);
  });

  test("modality masks and reasoning options", () => {
    const row = fixtureModel("anthropic", "claude-sonnet-4-5");
    expect(row.inputMask).toBe(modalityMask(["text", "image", "pdf"]));
    expect(row.outputMask).toBe(1);
    expect(row.reasoningOptions).toEqual([{ type: "budget_tokens", min: 1024 }]);
    expect(modalityMask(["unknown"])).toBe(0);
  });

  test("legacy context_over_200k becomes a 200k tier when tiers are absent", () => {
    const raw = structuredClone(rawModel(fixtureCatalog, "google", "gemini-2.5-pro"));
    delete raw.cost?.tiers;
    expect(normalizeModel("google", "gemini-2.5-pro", raw)?.tiers).toEqual([
      { size: 200_000, input: 2.5, output: 15, cacheRead: 0.25 },
    ]);
  });

  test.each([
    ["not an object", 5],
    ["missing name", { id: "x" }],
  ])("rejects %s", (_label, raw) => {
    expect(normalizeModel("p", "m", raw)).toBeNull();
  });

  test("rejects negative or non-numeric prices and limits", () => {
    const base = structuredClone(rawModel(fixtureCatalog, "anthropic", "claude-sonnet-4-5"));
    expect(normalizeModel("p", "m", { ...base, cost: { input: -1, output: 1 } })).toBeNull();
    expect(normalizeModel("p", "m", { ...base, cost: { input: "1", output: 1 } })).toBeNull();
    expect(normalizeModel("p", "m", { ...base, cost: { input: 1 } })).toBeNull();
    expect(normalizeModel("p", "m", { ...base, limit: { context: "x", output: 1 } })).toBeNull();
    expect(
      normalizeModel("p", "m", { ...base, modalities: { input: [1], output: [] } }),
    ).toBeNull();
    expect(normalizeModel("p", "m", { ...base, tool_call: "yes" })).toBeNull();
  });

  test("ignores unknown fields and bad mode names", () => {
    const base = structuredClone(rawModel(fixtureCatalog, "anthropic", "claude-sonnet-4-5"));
    const row = normalizeModel("p", "m", {
      ...base,
      brand_new_field: { a: 1 },
      experimental: {
        modes: { _bad: { cost: { input: 1, output: 1 } }, ok: { cost: { input: 1, output: 1 } } },
      },
    });
    expect(row?.modes).toEqual({ ok: { cost: { input: 1, output: 1 } } });
  });
});

describe("providers and catalog shape", () => {
  test("normalizeProvider", () => {
    expect(
      normalizeProvider(
        "anthropic",
        { name: "Anthropic", npm: "@ai-sdk/anthropic", env: ["K"], doc: "https://d" },
        4,
      ),
    ).toEqual({
      modelsDevProviderId: "anthropic",
      name: "Anthropic",
      npm: "@ai-sdk/anthropic",
      env: ["K"],
      doc: "https://d",
      modelCount: 4,
    });
    expect(normalizeProvider("x", {}, 0)?.name).toBe("x");
    expect(normalizeProvider("x", null, 0)).toBeNull();
    expect(normalizeProvider("x", { env: ["K", 3] }, 0)).toBeNull();
  });

  test("inspectCatalog counts providers and models and rejects non-objects", () => {
    expect(inspectCatalog(fixtureCatalog)).toMatchObject({
      providerCount: FIXTURE_PROVIDER_COUNT,
      modelCount: FIXTURE_MODEL_COUNT,
      skippedModels: 0,
    });
    expect(inspectCatalog({ a: { models: { m: {} } } })).toEqual({
      providerCount: 0,
      modelCount: 0,
      skippedModels: 1,
      modelCountByProvider: new Map([["a", 0]]),
    });
    for (const broken of [3, null, {}, { models: [] }, { models: "x" }]) {
      expect(inspectCatalog({ a: { models: {} }, b: broken })).toEqual({
        providerCount: 0,
        modelCount: 0,
        skippedModels: 0,
        modelCountByProvider: new Map([["a", 0]]),
      });
    }
    expect(() => inspectCatalog([])).toThrow();
    expect(() => inspectCatalog(null)).toThrow();
  });

  test("inspectCatalog counts only usable models per provider", () => {
    const usable = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
    expect(
      inspectCatalog({ a: { models: { good: usable, bad: { name: 3 } } } }).modelCountByProvider,
    ).toEqual(new Map([["a", 1]]));
  });

  test("pricingOf returns undefined without cost", () => {
    expect(pricingOf(fixtureModel("openai", "gpt-image-1-mini"))).toBeUndefined();
    expect(pricingOf(fixtureModel("openai", "gpt-5.4"))?.tiers).toHaveLength(1);
  });
});

describe("pricingOf modes", () => {
  test("includes mode pricing and mode tiers in the snapshot", () => {
    const row = fixtureModel("openai", "gpt-5.4");
    expect(pricingOf(row)?.modes).toEqual({
      fast: { cost: { input: 5, output: 30, cacheRead: 0.5 } },
    });
    const changed = { ...row, modes: { fast: { cost: { input: 6, output: 30 } } } };
    expect(JSON.stringify(pricingOf(changed))).not.toBe(JSON.stringify(pricingOf(row)));
  });
});

describe("hashing", () => {
  test("sha256 matches the known vector", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("canonical JSON ignores key order and undefined", async () => {
    expect(canonicalJson({ b: 1, a: [{ d: undefined, c: 2 }] })).toBe('{"a":[{"c":2}],"b":1}');
    expect(await rowHash({ a: 1, b: 2 })).toBe(await rowHash({ b: 2, a: 1 }));
    expect(await rowHash({ a: 1 })).not.toBe(await rowHash({ a: 2 }));
  });
});

test.each([
  { name: "x".repeat(2_000_000) },
  { name: "\ud800" },
  { description: "😀".repeat(20_000) },
  { reasoning_options: Array.from({ length: 129 }, () => ({ type: "toggle" })) },
])("unrepresentable remote values are skipped, case %#", (patch) => {
  expect(
    normalizeModel("openai", "m", {
      ...rawModel(fixtureCatalog, "openai", "gpt-5-mini"),
      ...patch,
    }),
  ).toBeNull();
});

test("provider strings and arrays obey storage bounds", () => {
  expect(normalizeProvider("p", { name: "\ud800" }, 1)).toBeNull();
  expect(normalizeProvider("p", { env: Array.from({ length: 129 }, () => "KEY") }, 1)).toBeNull();
});

test.each([{ min: -2 }, { max: -1 }, { max: Infinity }, { min: 10, max: 1 }])(
  "invalid reasoning budgets are skipped: %j",
  (bounds) => {
    expect(
      normalizeModel("p", "m", {
        ...rawModel(fixtureCatalog, "openai", "gpt-5-mini"),
        reasoning_options: [{ type: "budget_tokens", ...bounds }],
      }),
    ).toBeNull();
  },
);

test.each([
  "not-a-date",
  "2026-02-30",
  "2026-2-01",
  "2025-13",
  "2025-00",
  "2025-02-29",
  "2025-04-",
])("invalid release date %s is skipped", (release_date) => {
  expect(
    normalizeModel("p", "m", {
      ...rawModel(fixtureCatalog, "openai", "gpt-5-mini"),
      release_date,
    }),
  ).toBeNull();
});

test.each([
  { cost: { input: 1, output: 2, cache_read: null } },
  { cost: { input: 1, output: 2, context_over_200k: "bad" } },
  { experimental: { modes: { fast: { cost: "bad" } } } },
  { experimental: { modes: { fast: { cost: { tiers: "bad" } } } } },
])("malformed optional pricing rejects the model, case %#", (patch) => {
  expect(
    normalizeModel("p", "m", { ...rawModel(fixtureCatalog, "openai", "gpt-5-mini"), ...patch }),
  ).toBeNull();
});

test("a reasoning budget minimum of -1 is stored", () => {
  expect(
    fixtureModel("nvidia", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning").reasoningOptions,
  ).toEqual([{ type: "toggle" }, { type: "budget_tokens", min: -1, max: 32768 }]);
});

test("month-only dates are stored verbatim", () => {
  expect(fixtureModel("deepinfra", "Qwen/Qwen3-32B")).toMatchObject({
    knowledge: "2025-04",
    releaseDate: "2025-04",
    lastUpdated: "2025-04",
  });
  expect(
    normalizeModel("p", "m", {
      ...rawModel(fixtureCatalog, "openai", "gpt-5-mini"),
      release_date: "2024-02-29",
    })?.releaseDate,
  ).toBe("2024-02-29");
});

test("model type is stored verbatim and absent for language models", () => {
  expect(fixtureModel("novita-ai", "qwen/qwen3-embedding-8b").type).toBe("embedding");
  expect(fixtureModel("openai", "gpt-5-mini").type).toBeUndefined();
});

test("an unrecognized status is stored verbatim and a non-string status skips the model", () => {
  const raw = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
  expect(normalizeModel("p", "m", { ...raw, status: "retired" })?.status).toBe("retired");
  expect(normalizeModel("p", "m", { ...raw, status: 1 })).toBeNull();
  expect(fixtureModel("azure", "deepseek-v4.1-flash").status).toBe("beta");
});

test("a model row above 4 KiB of serialized JSON is skipped", () => {
  const raw = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
  const fitted = normalizeModel("p", "m", { ...raw, description: "" });
  const room = MAX_MODEL_ROW_BYTES - jsonBytes(fitted);
  expect(normalizeModel("p", "m", { ...raw, description: "d".repeat(room) })).not.toBeNull();
  expect(normalizeModel("p", "m", { ...raw, description: "d".repeat(room + 1) })).toBeNull();
});

test("limits are stored as the upstream limit object", () => {
  expect(fixtureModel("deepinfra", "Qwen/Qwen3-32B")).toMatchObject({
    limit: { context: 40960, output: 16384 },
    contextTokens: 40960,
  });
  expect(
    normalizeModel("p", "m", {
      ...rawModel(fixtureCatalog, "openai", "gpt-5-mini"),
      limit: { context: 1000, input: 800, output: 200 },
    })?.limit,
  ).toEqual({ context: 1000, input: 800, output: 200 });
});

test("the upstream provider override is stored with its shape", () => {
  expect(fixtureModel("azure", "deepseek-v4.1-flash").providerOverride).toEqual({
    npm: "@ai-sdk/openai-compatible",
    api: "https://${AZURE_RESOURCE_NAME}.services.ai.azure.com/models",
    shape: "completions",
  });
});

test("an interleaved object is stored", () => {
  expect(fixtureModel("deepseek", "deepseek-v4-flash-vision-exp").interleaved).toEqual({
    field: "reasoning_content",
  });
});
