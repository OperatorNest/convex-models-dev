import { describe, expect, test } from "vitest";
import { fixtureModel } from "../fixtures/index.js";
import { estimateCost, usageFromAgent, type CostModel } from "./cost.js";

function known(
  model: CostModel,
  usage: Parameters<typeof estimateCost>[1],
  opts?: Parameters<typeof estimateCost>[2],
) {
  const estimate = estimateCost(model, usage, opts);
  if (!estimate.known) throw new Error("expected a known estimate");
  return estimate;
}

const sonnet = fixtureModel("anthropic", "claude-sonnet-4-5");
const gemini = fixtureModel("google", "gemini-2.5-pro");
const gpt54 = fixtureModel("openai", "gpt-5.4");

describe("estimateCost matrix (spec 6.4)", () => {
  test("no cache", () => {
    const e = known(sonnet, { inputTokens: 1000, outputTokens: 500 });
    expect(e.nanoUsd).toBe(3_000_000 + 7_500_000);
    expect(e.usd).toBe(0.0105);
    expect(e.tier).toBeNull();
    expect(e.mode).toBeNull();
    expect(e.assumptions).toEqual([]);
    expect(e.breakdown.uncachedInput).toBe(0.003);
    expect(e.breakdown.text).toBe(0.0075);
  });

  test("cache read only", () => {
    const e = known(sonnet, { inputTokens: 10_000, outputTokens: 0, cachedInputTokens: 8000 });
    expect(e.breakdown.uncachedInput).toBe(0.006);
    expect(e.breakdown.cacheRead).toBe(0.0024);
    expect(e.nanoUsd).toBe(8_400_000);
  });

  test("anthropic cache write plus read, input includes cache", () => {
    const e = known(sonnet, {
      inputTokens: 10_000,
      outputTokens: 1000,
      cacheReadTokens: 6000,
      cacheWriteTokens: 2000,
    });
    expect(e.nanoUsd).toBe(6_000_000 + 1_800_000 + 7_500_000 + 15_000_000);
  });

  test("raw anthropic usage with inputIncludesCache false", () => {
    const e = known(
      sonnet,
      { inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 6000, cacheWriteTokens: 2000 },
      { inputIncludesCache: false },
    );
    expect(e.nanoUsd).toBe(6_000_000 + 1_800_000 + 7_500_000 + 15_000_000);
  });

  test("reasoning is a subset of output and uses cost.reasoning when present", () => {
    const priced: CostModel = { costInput: 1, costOutput: 4, costReasoning: 8 };
    const e = known(priced, { inputTokens: 0, outputTokens: 1000, reasoningTokens: 400 });
    expect(e.nanoUsd).toBe(600 * 4000 + 400 * 8000);
    expect(e.assumptions).toEqual([]);
  });

  test("reasoning falls back to the output rate and says so", () => {
    const e = known({ costInput: 1, costOutput: 4 }, { outputTokens: 1000, reasoningTokens: 400 });
    expect(e.nanoUsd).toBe(1000 * 4000);
    expect(e.assumptions).toEqual(["reasoning priced at the output rate (no listed price)"]);
  });

  test("real reasoning model", () => {
    const m = fixtureModel("deepseek", "deepseek-v4-flash-vision-exp");
    const e = known(m, { inputTokens: 1000, outputTokens: 1000, reasoningTokens: 500 });
    expect(e.nanoUsd).toBe(1000 * 150 + 500 * 600 + 500 * 600);
  });

  test("gemini-2.5-pro at 200,000 vs 200,001 prompt tokens", () => {
    const at = known(gemini, { inputTokens: 200_000 });
    expect(at.tier).toBeNull();
    expect(at.nanoUsd).toBe(200_000 * 1250);
    const over = known(gemini, { inputTokens: 200_001, outputTokens: 10 });
    expect(over.tier).toBe(200_000);
    expect(over.nanoUsd).toBe(200_001 * 2500 + 10 * 15_000);
  });

  test("tier applies to the whole prompt, including cache reads", () => {
    const e = known(gemini, { inputTokens: 300_000, cacheReadTokens: 100_000 });
    expect(e.nanoUsd).toBe(200_000 * 2500 + 100_000 * 250);
  });

  test("gpt-5.4 at 272,000 vs 272,001 prompt tokens", () => {
    expect(known(gpt54, { inputTokens: 272_000, outputTokens: 100 }).tier).toBeNull();
    const over = known(gpt54, { inputTokens: 272_001, outputTokens: 100 });
    expect(over.tier).toBe(272_000);
    expect(over.nanoUsd).toBe(272_001 * 5000 + 100 * 22_500);
  });

  test("gpt-5.4 mode fast overrides the base table", () => {
    const e = known(gpt54, { inputTokens: 1000, outputTokens: 1000 }, { mode: "fast" });
    expect(e.mode).toBe("fast");
    expect(e.nanoUsd).toBe(1000 * 5000 + 1000 * 30_000);
  });

  test("mode above a base tier: per-field max of mode and base tier, with an assumption", () => {
    const e = known(gpt54, { inputTokens: 272_001, outputTokens: 1000 }, { mode: "fast" });
    expect(e.mode).toBe("fast");
    expect(e.tier).toBe(272_000);
    // fast: 5 / 30; base tier: 5 / 22.5 -> output stays 30, never lowered to 22.5.
    expect(e.nanoUsd).toBe(272_001 * 5000 + 1000 * 30_000);
    expect(e.assumptions).toEqual(["mode_without_tiers: used max(mode, base tier) per field"]);
  });

  test("a base tier can still raise a mode's price", () => {
    const m: CostModel = {
      costInput: 1,
      costOutput: 2,
      tiers: [{ size: 100, input: 4, output: 8 }],
      modes: { fast: { cost: { input: 3, output: 5 } } },
    };
    const e = known(m, { inputTokens: 1000, outputTokens: 1000 }, { mode: "fast" });
    expect(e.nanoUsd).toBe(1000 * 4000 + 1000 * 8000);
    expect(known(m, { inputTokens: 50, outputTokens: 0 }, { mode: "fast" }).assumptions).toEqual(
      [],
    );
  });

  test("mode-defined tiers are used instead of base tiers", () => {
    const m: CostModel = {
      costInput: 1,
      costOutput: 2,
      tiers: [{ size: 100, input: 40, output: 80 }],
      modes: { fast: { cost: { input: 3, output: 5 }, tiers: [{ size: 100, input: 6 }] } },
    };
    const e = known(m, { inputTokens: 1000, outputTokens: 1000 }, { mode: "fast" });
    expect(e.nanoUsd).toBe(1000 * 6000 + 1000 * 5000);
    expect(e.assumptions).toEqual([]);
    expect(e.tier).toBe(100);
  });

  test("unknown mode is ignored; mode without cost keeps the base table", () => {
    const e = known(gpt54, { inputTokens: 1000 }, { mode: "nope" });
    expect(e.mode).toBeNull();
    expect(e.nanoUsd).toBe(1000 * 2500);
    const pro = fixtureModel("openai", "gpt-5.6");
    expect(known(pro, { inputTokens: 1000 }, { mode: "pro" }).mode).toBeNull();
  });

  test("a tier missing a field falls back to the base value", () => {
    const m: CostModel = {
      costInput: 1,
      costOutput: 2,
      costCacheRead: 0.1,
      tiers: [{ size: 100, input: 3 }],
    };
    const e = known(m, { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 500 });
    expect(e.nanoUsd).toBe(500 * 3000 + 500 * 100 + 1000 * 2000);
  });

  test("N+1 tier sizes start at N+1 inclusive", () => {
    const m: CostModel = {
      costInput: 1,
      costOutput: 1,
      tiers: [{ size: 200_001, input: 2, output: 2 }],
    };
    expect(known(m, { inputTokens: 200_000 }).tier).toBeNull();
    expect(known(m, { inputTokens: 200_001 }).tier).toBe(200_001);
  });

  test("the largest crossed tier wins", () => {
    const m: CostModel = {
      costInput: 1,
      costOutput: 1,
      tiers: [
        { size: 100, input: 2 },
        { size: 1000, input: 3 },
      ],
    };
    expect(known(m, { inputTokens: 500 }).tier).toBe(100);
    expect(known(m, { inputTokens: 5000 }).tier).toBe(1000);
  });

  test("missing cost is unknown, never zero", () => {
    expect(estimateCost(fixtureModel("openai", "gpt-image-1-mini"), { inputTokens: 5 })).toEqual({
      known: false,
    });
    expect(estimateCost({}, { inputTokens: 5 })).toEqual({ known: false });
    expect(estimateCost({ costInput: 1 }, { inputTokens: 5 })).toEqual({ known: false });
    expect(estimateCost({ costInput: -1, costOutput: 1 }, { inputTokens: 5 })).toEqual({
      known: false,
    });
  });

  test("zero-cost model is known and free", () => {
    const e = known(fixtureModel("google", "lyria-3-pro-preview"), {
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(e.nanoUsd).toBe(0);
    expect(e.usd).toBe(0);
  });

  test("audio tokens use audio prices, with fallbacks reported", () => {
    const flash = fixtureModel("google", "gemini-3.5-flash");
    const e = known(flash, { inputTokens: 1000, inputAudioTokens: 400, outputTokens: 100 });
    expect(e.nanoUsd).toBe(600 * 1500 + 400 * 1500 + 100 * 9000);
    const out = known(
      { costInput: 1, costOutput: 4 },
      { outputTokens: 1000, outputAudioTokens: 250 },
    );
    expect(out.nanoUsd).toBe(750 * 4000 + 250 * 4000);
    expect(out.assumptions).toEqual(["outputAudio priced at the output rate (no listed price)"]);
  });

  test("cache tokens without cache prices fall back to the input rate", () => {
    const e = known(
      { costInput: 2, costOutput: 4 },
      { inputTokens: 1000, cacheReadTokens: 400, cacheWriteTokens: 100 },
    );
    expect(e.nanoUsd).toBe(1000 * 2000);
    expect(e.assumptions).toHaveLength(2);
  });
});

describe("usage normalization", () => {
  const model: CostModel = { costInput: 1, costOutput: 2, costCacheRead: 0.5, costCacheWrite: 1.5 };

  test("promptTokens and completionTokens spellings", () => {
    const e = known(model, { promptTokens: 1000, completionTokens: 500 });
    expect(e.nanoUsd).toBe(1000 * 1000 + 500 * 2000);
  });

  test("inputTokens wins over promptTokens", () => {
    expect(known(model, { inputTokens: 10, promptTokens: 999 }).nanoUsd).toBe(10 * 1000);
  });

  test("noCache plus cache read and write derives the prompt size", () => {
    const e = known(model, { noCacheTokens: 100, cacheReadTokens: 200, cacheWriteTokens: 50 });
    expect(e.nanoUsd).toBe(100 * 1000 + 200 * 500 + 50 * 1500);
  });

  test("nonCachedInputTokens is honoured as given", () => {
    const e = known(model, {
      inputTokens: 1000,
      nonCachedInputTokens: 300,
      cachedInputTokens: 700,
    });
    expect(e.nanoUsd).toBe(300 * 1000 + 700 * 500);
  });

  test("textOutputTokens plus reasoningTokens when output is absent", () => {
    const e = known(
      { ...model, costReasoning: 4 },
      { textOutputTokens: 300, reasoningTokens: 100 },
    );
    expect(e.nanoUsd).toBe(300 * 2000 + 100 * 4000);
  });

  test("negative, NaN and fractional counts are clamped to whole non-negative numbers", () => {
    const e = known(model, { inputTokens: -5, outputTokens: Number.NaN, cacheReadTokens: 10.9 });
    expect(e.nanoUsd).toBe(10 * 500);
    expect(known(model, { inputTokens: 10.9 }).nanoUsd).toBe(10 * 1000);
  });

  test("cache tokens never push uncached input below zero", () => {
    const e = known(model, { inputTokens: 100, cacheReadTokens: 500 });
    expect(e.breakdown.uncachedInput).toBe(0);
  });

  test("terms are rounded once in integer nano-USD (no float drift)", () => {
    const m: CostModel = { costInput: 0.3, costOutput: 0.7 };
    const e = known(m, { inputTokens: 7, outputTokens: 3 });
    expect(Number.isInteger(e.nanoUsd)).toBe(true);
    expect(e.nanoUsd).toBe(2100 + 2100);
    expect(e.usd).toBe(4200 / 1e9);
  });

  test("priceSnapshotAt echoes updatedAt", () => {
    expect(known({ ...model, updatedAt: 123 }, { inputTokens: 1 }).priceSnapshotAt).toBe(123);
    expect(known(model, { inputTokens: 1 }).priceSnapshotAt).toBeNull();
  });
});

describe("usageFromAgent", () => {
  test("AI SDK 5/6 spelling", () => {
    expect(
      usageFromAgent({
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cachedInputTokens: 20,
          reasoningTokens: 5,
          totalTokens: 150,
        },
      }),
    ).toEqual({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, reasoningTokens: 5 });
  });

  test("AI SDK 7 detail objects", () => {
    expect(
      usageFromAgent({
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          inputTokenDetails: { noCacheTokens: 60, cacheReadTokens: 30, cacheWriteTokens: 10 },
          outputTokenDetails: { textTokens: 40, reasoningTokens: 10 },
        },
      }),
    ).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 30,
      cacheWriteTokens: 10,
      noCacheTokens: 60,
      reasoningTokens: 10,
      textOutputTokens: 40,
    });
  });

  test("provider metadata only fills missing cache fields", () => {
    expect(
      usageFromAgent({
        usage: { inputTokens: 100, outputTokens: 5 },
        providerMetadata: {
          anthropic: { cacheCreationInputTokens: 40 },
          openai: { cachedPromptTokens: 12 },
        },
      }),
    ).toEqual({ inputTokens: 100, outputTokens: 5, cacheReadTokens: 12, cacheWriteTokens: 40 });
    expect(
      usageFromAgent({
        usage: { inputTokens: 100, cachedInputTokens: 7 },
        providerMetadata: { openai: { cachedPromptTokens: 12 } },
      }).cacheReadTokens,
    ).toBe(7);
  });

  test("maps the cacheWriteInputTokens and nonCachedInputTokens spellings", () => {
    expect(
      usageFromAgent({
        usage: { inputTokens: 100, cacheWriteInputTokens: 30, nonCachedInputTokens: 50 },
      }),
    ).toEqual({ inputTokens: 100, cacheWriteTokens: 30, noCacheTokens: 50 });
  });

  test("tolerates garbage", () => {
    expect(usageFromAgent({})).toEqual({});
    expect(usageFromAgent({ usage: "x", providerMetadata: 3 })).toEqual({});
    expect(usageFromAgent({ usage: { inputTokens: "5" } })).toEqual({});
  });
});
