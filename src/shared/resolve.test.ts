import { describe, expect, test } from "vitest";
import { providerCandidates, resolveModel, splitModelKey } from "./resolve.js";

describe("resolveModel", () => {
  test.each([
    ["anthropic.messages", "anthropic"],
    ["openai.responses", "openai"],
    ["openai.chat", "openai"],
    ["google.generative-ai", "google"],
    ["google.vertex.chat", "google-vertex"],
    ["gateway", "vercel"],
    ["azure.chat", "azure"],
    ["Amazon-Bedrock", "amazon-bedrock"],
    ["bedrock", "amazon-bedrock"],
    ["xai", "xai"],
  ])("%s -> %s", (provider, expected) => {
    expect(resolveModel({ provider, model: "m" })).toEqual({ providerId: expected, modelId: "m" });
  });

  test("custom aliases win", () => {
    expect(
      resolveModel({ provider: "mine", model: "m", aliases: { mine: "openai" } }).providerId,
    ).toBe("openai");
    expect(providerCandidates("openai.chat", { "openai.chat": "azure" })[0]).toBe("azure");
  });

  test("candidates keep the stripped and full forms as fallbacks", () => {
    expect(providerCandidates("foo.bar")).toEqual(["foo", "foo.bar"]);
  });
});

describe("splitModelKey", () => {
  const known = new Set(["openai", "openrouter", "amazon-bedrock"]);
  const isProvider = (id: string) => known.has(id);

  test("splits on the first separator with a known provider", () => {
    expect(splitModelKey("openai/gpt-5.4", isProvider)).toEqual({
      providerId: "openai",
      modelId: "gpt-5.4",
    });
    expect(splitModelKey("openai:gpt-5.4", isProvider)).toEqual({
      providerId: "openai",
      modelId: "gpt-5.4",
    });
    expect(splitModelKey("openrouter/anthropic/claude-sonnet-4-5", isProvider)).toEqual({
      providerId: "openrouter",
      modelId: "anthropic/claude-sonnet-4-5",
    });
    expect(splitModelKey("amazon-bedrock/qwen.qwen3:0", isProvider)?.modelId).toBe("qwen.qwen3:0");
  });

  test("returns null without a known provider or model", () => {
    expect(splitModelKey("anthropic/claude", isProvider)).toBeNull();
    expect(splitModelKey("gpt-5.4", isProvider)).toBeNull();
    expect(splitModelKey("openai/", isProvider)).toBeNull();
  });
});
