import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal, components } from "../../example/convex/_generated/api.js";
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

async function synced(options?: ModelsDevOptions) {
  const harness = setup(options);
  catalogServer({ body: fixtureJson() });
  await harness.t.mutation(internal.example.configureSync, { minProviders: 1, minModels: 1 });
  await harness.t.action(internal.example.syncForced, {});
  return harness;
}

describe("every public client method", () => {
  test("stored models can be read by identity, key, alias, page and search", async () => {
    const { t, client } = await synced();
    await t.run(async (ctx) => {
      expect(
        await client.models.get(ctx, {
          modelsDevProviderId: "openai",
          modelsDevModelId: "gpt-5.4",
        }),
      ).toMatchObject({ modelsDevProviderId: "openai", modelsDevModelId: "gpt-5.4" });
      expect(await client.models.getByKey(ctx, { key: "openai/gpt-5.4" })).toMatchObject({
        modelsDevModelId: "gpt-5.4",
      });
      expect(
        await client.models.resolve(ctx, {
          provider: "anthropic.messages",
          model: "claude-sonnet-4-5",
        }),
      ).toMatchObject({ modelsDevProviderId: "anthropic" });
      const page = await client.models.list(ctx, { paginationOpts: { cursor: null, numItems: 5 } });
      expect(page.page).toHaveLength(5);
      expect(page.isDone).toBe(false);
      const found = await client.models.search(ctx, { query: "sonnet" });
      expect(found.some((m) => m.modelsDevModelId === "claude-sonnet-4-5")).toBe(true);
    });
  });

  test("stored catalog prices support ranking, equivalence, history and usage estimates", async () => {
    const { t, client } = await synced();
    await t.run(async (ctx) => {
      expect((await client.models.listCheapest(ctx)).models.length).toBeGreaterThan(0);
      expect(
        (await client.models.listCheapest(ctx, { toolCall: true, limit: 2 })).models.every(
          (m) => m.toolCall,
        ),
      ).toBe(true);
      expect(
        await client.models.listEquivalents(ctx, { modelsDevCanonicalModelId: "nobody/none" }),
      ).toEqual([]);
      expect(
        await client.models.listPriceChanges(ctx, {
          modelsDevProviderId: "openai",
          modelsDevModelId: "gpt-5.4",
        }),
      ).toEqual([]);
      expect(
        await client.models.estimateCost(ctx, {
          mode: null,
          inputTokenScope: "includesCache",
          provider: "anthropic.messages",
          model: "claude-sonnet-4-5",
          usage: { inputTokens: 1000, outputTokens: 500 },
        }),
      ).toMatchObject({ known: true, nanoUsd: 10_500_000 });
    });
  });

  test("stored providers can be listed and read by catalog identity", async () => {
    const { t, client } = await synced();
    await t.run(async (ctx) => {
      const providers = await client.providers.list(ctx, {
        paginationOpts: { numItems: 2, cursor: null },
      });
      expect(providers.page).toHaveLength(2);
      expect(providers.isDone).toBe(false);
      const remaining = await client.providers.list(ctx, {
        paginationOpts: { numItems: 100, cursor: providers.continueCursor },
      });
      expect(remaining.page.map((p) => p.modelsDevProviderId)).toContain("openai");
      expect(await client.providers.get(ctx, { modelsDevProviderId: "openai" })).toMatchObject({
        name: "OpenAI",
      });
      expect(await client.providers.get(ctx, { modelsDevProviderId: "nobody" })).toBeNull();
    });
  });

  test("settings retain supplied updates across subsequent reads", async () => {
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

  test("guarded sync respects intervals and forced sync rechecks unchanged catalogs", async () => {
    const { t, client } = setup();
    catalogServer({ body: fixtureJson() });
    await t.mutation(internal.example.configureSync, { minProviders: 1, minModels: 1 });
    expect(await t.run((ctx) => client.sync.getStatus(ctx))).toMatchObject({
      state: "never_synced",
      running: false,
    });
    expect(await t.action(internal.example.syncNow, {})).toMatchObject({
      status: "ok",
      modelCount: FIXTURE_MODEL_COUNT,
    });
    expect(await t.action(internal.example.syncNow, {})).toMatchObject({
      status: "skipped",
      reason: "min_interval",
    });
    expect(await t.action(internal.example.syncForced, {})).toMatchObject({
      status: "not_modified",
    });
    expect(await t.run((ctx) => client.sync.getStatus(ctx))).toMatchObject({
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
      ).toMatchObject({ modelsDevProviderId: "openai" });
      expect(
        await client.models.resolve(ctx, {
          provider: "my-gateway",
          model: "claude-sonnet-4-5",
          aliases: { "my-gateway": "anthropic" },
        }),
      ).toMatchObject({ modelsDevProviderId: "anthropic" });
      const estimate = await client.models.estimateCost(ctx, {
        mode: null,
        inputTokenScope: "includesCache",
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
      expect(error.data.code).toBe("MODELS_DEV_INVALID_ARGUMENT");
    }
  });

  test("rejects other errors and foreign ConvexErrors", () => {
    expect(isModelsDevError(new Error("x"))).toBe(false);
    expect(isModelsDevError(new ConvexError("x"))).toBe(false);
    expect(isModelsDevError(new ConvexError({ code: "OTHER", message: "x" }))).toBe(false);
    expect(isModelsDevError(new ConvexError({ message: "x" }))).toBe(false);
    expect(isModelsDevError(new ConvexError(null))).toBe(false);
    const code = "MODELS_DEV_INVALID_ARGUMENT";
    expect(isModelsDevError(new ConvexError({ code }))).toBe(false);
    expect(isModelsDevError(new ConvexError({ code, message: 5 }))).toBe(false);
    expect(isModelsDevError(new ConvexError({ code, message: "x", retryable: "yes" }))).toBe(false);
    expect(isModelsDevError(new ConvexError({ code, message: "x", retryable: true }))).toBe(false);
    expect(isModelsDevError(new ConvexError({ code, message: "x" }))).toBe(false);
    expect(isModelsDevError(null)).toBe(false);
  });
});

test("client copies declared arguments and nested options", async () => {
  const { t, client } = await synced({ aliases: { gateway: "openai" } });
  await t.run(async (ctx) => {
    const extra = { unexpected: "ignored" };
    expect(
      await client.models.get(ctx, {
        modelsDevProviderId: "openai",
        modelsDevModelId: "gpt-5.4",
        ...extra,
      }),
    ).not.toBeNull();
    expect(await client.models.getByKey(ctx, { key: "openai/gpt-5.4", ...extra })).not.toBeNull();
    expect(
      await client.models.resolve(ctx, { provider: "gateway", model: "gpt-5.4", ...extra }),
    ).not.toBeNull();
    expect(
      (
        await client.models.list(ctx, {
          paginationOpts: { numItems: 1, cursor: null, ...extra },
          ...extra,
        })
      ).page,
    ).toHaveLength(1);
    expect(
      (
        await client.providers.list(ctx, {
          paginationOpts: {
            numItems: 1,
            cursor: null,
            maximumRowsRead: 0,
            maximumBytesRead: 0,
            ...extra,
          },
          ...extra,
        })
      ).page,
    ).toHaveLength(1);
    expect(await client.models.search(ctx, { query: "gpt", ...extra })).not.toEqual([]);
    expect((await client.models.listCheapest(ctx, { limit: 1, ...extra })).models).not.toEqual([]);
    expect(
      await client.models.listEquivalents(ctx, { modelsDevCanonicalModelId: "none", ...extra }),
    ).toEqual([]);
    expect(
      await client.models.listPriceChanges(ctx, {
        modelsDevProviderId: "openai",
        modelsDevModelId: "gpt-5.4",
        ...extra,
      }),
    ).toEqual([]);
    expect(
      await client.models.estimateCost(ctx, {
        mode: null,
        inputTokenScope: "includesCache",
        provider: "gateway",
        model: "gpt-5.4",
        usage: { inputTokens: 1, ...extra },
        ...extra,
      }),
    ).toMatchObject({ known: true });
    expect(
      await client.providers.get(ctx, { modelsDevProviderId: "openai", ...extra }),
    ).not.toBeNull();
    expect(await client.config.update(ctx, { enabled: true, ...extra })).toMatchObject({
      enabled: true,
    });
  });
});
