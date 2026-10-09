import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, components } from "../../example/convex/_generated/api.js";
import exampleSchema from "../../example/convex/schema.js";
import { fixtureJson, FIXTURE_MODEL_COUNT } from "../fixtures/index.js";
import { register } from "../test.js";
import { catalogServer } from "../test-helpers.js";
import { isModelsDevError, ModelsDev, type ModelsDevOptions } from "./index.js";

const modules = import.meta.glob([
  "../../example/convex/**/*.ts",
  "!../../example/convex/**/*.test.ts",
]);

afterEach(() => vi.unstubAllGlobals());

function setup(options?: ModelsDevOptions) {
  const t = convexTest(exampleSchema, modules);
  register(t);
  const client = new ModelsDev(components.modelsDev, options);
  return { t, client };
}

/** Syncs the fixture catalog through the example app, then returns a client with `options`. */
async function synced(options?: ModelsDevOptions) {
  const harness = setup(options);
  catalogServer({ body: fixtureJson() });
  await harness.t.mutation(api.example.configureSync, { minProviders: 1, minModels: 1 });
  await harness.t.action(api.example.syncNow, { force: true });
  return harness;
}

describe("every public client method", () => {
  test("models.get, getByKey, resolve, list, search", async () => {
    const { t, client } = await synced();
    await t.run(async (ctx) => {
      expect(
        await client.models.get(ctx, { providerId: "openai", modelId: "gpt-5.4" }),
      ).toMatchObject({ providerId: "openai", modelId: "gpt-5.4" });
      expect(await client.models.getByKey(ctx, { key: "openai/gpt-5.4" })).toMatchObject({
        modelId: "gpt-5.4",
      });
      expect(
        await client.models.resolve(ctx, {
          provider: "anthropic.messages",
          model: "claude-sonnet-4-5",
        }),
      ).toMatchObject({ providerId: "anthropic" });
      const page = await client.models.list(ctx, { paginationOpts: { cursor: null, numItems: 5 } });
      expect(page.page).toHaveLength(5);
      expect(page.isDone).toBe(false);
      const found = await client.models.search(ctx, { query: "sonnet" });
      expect(found.some((m) => m.modelId === "claude-sonnet-4-5")).toBe(true);
    });
  });

  test("models.cheapest, equivalents, priceHistory, estimateCost", async () => {
    const { t, client } = await synced();
    await t.run(async (ctx) => {
      expect((await client.models.cheapest(ctx)).length).toBeGreaterThan(0);
      expect(
        (await client.models.cheapest(ctx, { toolCall: true, limit: 2 })).every((m) => m.toolCall),
      ).toBe(true);
      expect(await client.models.equivalents(ctx, { canonicalModelId: "nobody/none" })).toEqual([]);
      expect(
        await client.models.priceHistory(ctx, { providerId: "openai", modelId: "gpt-5.4" }),
      ).toEqual([]);
      expect(
        await client.models.estimateCost(ctx, {
          provider: "anthropic.messages",
          model: "claude-sonnet-4-5",
          usage: { inputTokens: 1000, outputTokens: 500 },
        }),
      ).toMatchObject({ known: true, nanoUsd: 10_500_000 });
    });
  });

  test("providers.list and providers.get", async () => {
    const { t, client } = await synced();
    await t.run(async (ctx) => {
      const providers = await client.providers.list(ctx);
      expect(providers.map((p) => p.providerId)).toContain("openai");
      expect(await client.providers.get(ctx, { providerId: "openai" })).toMatchObject({
        name: "OpenAI",
      });
      expect(await client.providers.get(ctx, { providerId: "nobody" })).toBeNull();
    });
  });

  test("config.get and config.update", async () => {
    const { t, client } = setup();
    await t.run(async (ctx) => {
      expect(await client.config.get(ctx)).toMatchObject({ minModels: 1000, enabled: true });
      expect(await client.config.update(ctx, { minProviders: 1, minModels: 1 })).toMatchObject({
        minProviders: 1,
        minModels: 1,
      });
      expect(await client.config.get(ctx)).toMatchObject({ minModels: 1 });
    });
  });

  test("sync.now with and without args, and sync.status", async () => {
    const { t, client } = setup();
    catalogServer({ body: fixtureJson() });
    await t.mutation(api.example.configureSync, { minProviders: 1, minModels: 1 });
    expect(await t.run((ctx) => client.sync.status(ctx))).toMatchObject({
      state: "never_synced",
      running: false,
    });
    expect(await t.action(api.example.syncNow, {})).toMatchObject({
      status: "ok",
      modelCount: FIXTURE_MODEL_COUNT,
    });
    expect(await t.action(api.example.syncNow, {})).toMatchObject({
      status: "skipped",
      reason: "min_interval",
    });
    expect(await t.action(api.example.syncNow, { force: true })).toMatchObject({
      status: "not_modified",
    });
    expect(await t.run((ctx) => client.sync.status(ctx))).toMatchObject({
      state: "ok",
      running: false,
    });
  });
});

describe("options.aliases", () => {
  test("instance aliases resolve and price models, and per-call aliases win", async () => {
    const { t, client } = await synced({ aliases: { "my-gateway": "openai" } });
    await t.run(async (ctx) => {
      expect(
        await client.models.resolve(ctx, { provider: "my-gateway", model: "gpt-5.4" }),
      ).toMatchObject({ providerId: "openai" });
      expect(
        await client.models.resolve(ctx, {
          provider: "my-gateway",
          model: "claude-sonnet-4-5",
          aliases: { "my-gateway": "anthropic" },
        }),
      ).toMatchObject({ providerId: "anthropic" });
      const estimate = await client.models.estimateCost(ctx, {
        provider: "my-gateway",
        model: "gpt-5.4",
        usage: { inputTokens: 1, outputTokens: 1 },
      });
      expect(estimate.known).toBe(true);
    });
  });

  test("without aliases an unknown provider string resolves to nothing", async () => {
    const { t, client } = await synced();
    expect(
      await t.run((ctx) =>
        client.models.resolve(ctx, { provider: "my-gateway", model: "gpt-5.4" }),
      ),
    ).toBeNull();
  });
});

describe("isModelsDevError", () => {
  test("recognises this component's errors from a real failing call", async () => {
    const { t, client } = setup();
    const error = await t
      .run((ctx) => client.config.update(ctx, { sourceUrl: "http://models.dev/api.json" }))
      .catch((caught: unknown) => caught);
    expect(isModelsDevError(error)).toBe(true);
    if (isModelsDevError(error)) {
      expect(error.data.code).toBe("MODELS_DEV_INVALID_SOURCE_URL");
    }
  });

  test("rejects other errors and foreign ConvexErrors", () => {
    expect(isModelsDevError(new Error("x"))).toBe(false);
    expect(isModelsDevError(new ConvexError("x"))).toBe(false);
    expect(isModelsDevError(new ConvexError({ code: "OTHER", message: "x" }))).toBe(false);
    expect(isModelsDevError(new ConvexError({ message: "x" }))).toBe(false);
    expect(isModelsDevError(new ConvexError(null))).toBe(false);
    const code = "MODELS_DEV_INVALID_CONFIG";
    expect(isModelsDevError(new ConvexError({ code }))).toBe(false);
    expect(isModelsDevError(new ConvexError({ code, message: 5 }))).toBe(false);
    expect(isModelsDevError(new ConvexError({ code, message: "x", retryable: "yes" }))).toBe(false);
    expect(isModelsDevError(new ConvexError({ code, message: "x", retryable: true }))).toBe(true);
    expect(isModelsDevError(new ConvexError({ code, message: "x" }))).toBe(true);
    expect(isModelsDevError(null)).toBe(false);
  });
});
