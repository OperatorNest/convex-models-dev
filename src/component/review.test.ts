import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import {
  catalogServer,
  componentTest,
  relaxGuards,
  requireValue,
  stubFetch,
} from "../test-helpers.js";
import { fixtureCatalog, fixtureJson, fixtureModel, rawModel } from "../fixtures/index.js";
import { estimateCost } from "../shared/cost.js";
import { normalizeModel, normalizeProvider } from "../shared/normalize.js";

const sync = (t: ReturnType<typeof componentTest>, force = true) =>
  t.action(api.sync.syncNow, { force });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("finding 1: invalid usage throws before model resolution", async () => {
  const t = componentTest();
  const invalid = { data: { code: "MODELS_DEV_INVALID_ARGUMENT" } };
  for (const count of [NaN, -1, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => estimateCost({ costInput: 1, costOutput: 1 }, { inputTokens: count })).toThrow();
    await expect(
      t.query(api.models.estimate, {
        provider: "missing",
        model: "missing",
        usage: { outputTokens: count },
      }),
    ).rejects.toMatchObject(invalid);
  }
  expect(() => estimateCost({}, { inputTokens: 1, promptTokens: -1 })).toThrow();
});

test("finding 2: an unpriced requested mode is unknown", async () => {
  const modeModel = {
    costInput: 1,
    costOutput: 2,
    modes: {
      empty: { cost: {} },
      tiersOnly: { tiers: [{ size: 100, input: 3, output: 4 }] },
    },
  };
  expect(estimateCost(modeModel, { inputTokens: 10 }, { mode: "empty" })).toEqual({ known: false });
  expect(estimateCost(modeModel, { inputTokens: 10 }, { mode: "tiersOnly" })).toEqual({
    known: false,
  });
  expect(estimateCost(modeModel, { inputTokens: 101 }, { mode: "tiersOnly" })).toMatchObject({
    known: true,
    nanoUsd: 303000,
    mode: "tiersOnly",
  });
  expect(
    estimateCost(fixtureModel("openai", "gpt-5.4"), { inputTokens: 10 }, { mode: "absent" }),
  ).toEqual({ known: false });
  const t = componentTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson() });
  await sync(t);
  expect(
    await t.query(api.models.estimate, {
      provider: "openai",
      model: "gpt-5.4",
      usage: { inputTokens: 10 },
      mode: "absent",
    }),
  ).toEqual({ known: false });
});

test("finding 3: indexed UTF-8 strings are bounded and skipped rows survive", async () => {
  const template = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
  const oversized = "😀".repeat(257);
  for (const row of [
    normalizeModel(oversized, "m", template),
    normalizeModel("p", oversized, template),
    normalizeModel("p", "m", { ...template, family: oversized }),
    normalizeModel("p", "m", { ...template, canonical_model_id: oversized }),
    normalizeModel("p", "m", { ...template, name: "x".repeat(1024) }),
    normalizeProvider(oversized, { models: { m: template } }, 1),
  ])
    expect(row).toBeNull();
  expect(
    normalizeModel("p", "m", { ...template, canonical_model_id: "😀".repeat(256) }),
  ).not.toBeNull();
  const t = componentTest();
  await relaxGuards(t);
  const server = catalogServer({ body: fixtureJson() });
  await sync(t);
  const before = await t.query(api.models.get, { providerId: "openai", modelId: "gpt-5.4" });
  server.body = fixtureJson((c) => {
    rawModel(c, "openai", "gpt-5.4").family = oversized;
  });
  server.etag = '"oversized"';
  expect(await sync(t)).toMatchObject({ status: "ok", skippedModels: 1 });
  expect(await t.query(api.models.get, { providerId: "openai", modelId: "gpt-5.4" })).toEqual(
    before,
  );
});

test("finding 4: a streamed catalog stops above 16 MiB", async () => {
  const t = componentTest();
  await relaxGuards(t);
  let pulls = 0;
  let cancelled = 0;
  stubFetch(
    () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulls++;
            controller.enqueue(new Uint8Array(1024 * 1024));
          },
          cancel() {
            cancelled++;
          },
        }),
      ),
  );
  expect(await sync(t)).toMatchObject({
    status: "error",
    error: { code: "MODELS_DEV_CATALOG_TOO_LARGE" },
  });
  expect(cancelled).toBe(2);
  expect(pulls).toBeLessThanOrEqual(36);
});

test("finding 5: provider cheapest reads past unrelated rows and reports scan truncation", async () => {
  const t = componentTest();
  const base = fixtureModel("openai", "gpt-5.4");
  await t.run(async (ctx) => {
    for (let i = 0; i < 4001; i++)
      await ctx.db.insert("models", {
        ...base,
        providerId: "unrelated",
        modelId: `m-${i}`,
        costBlended: 0,
        contentHash: "h",
        firstSeenAt: 0,
        updatedAt: 0,
      });
    for (const [providerId, costBlended] of [
      ["wanted", 5],
      ["other", 2],
    ] as const)
      await ctx.db.insert("models", {
        ...base,
        providerId,
        costBlended,
        contentHash: "h",
        firstSeenAt: 0,
        updatedAt: 0,
      });
  });
  const result = await t.query(api.models.cheapest, {
    providerIds: ["wanted", "other", "wanted"],
    limit: 5,
  });
  expect(result).toMatchObject({
    models: [{ providerId: "other" }, { providerId: "wanted" }],
    isComplete: true,
  });
  expect(await t.query(api.models.cheapest, { reasoning: !base.reasoning })).toEqual({
    models: [],
    isComplete: false,
  });
  expect(await t.query(api.models.cheapest, { providerIds: [] })).toEqual({
    models: [],
    isComplete: true,
  });
}, 60000);

test("finding 6: losing more than 20 percent of stored prices writes no catalog rows", async () => {
  const t = componentTest();
  await relaxGuards(t);
  const server = catalogServer({ body: fixtureJson() });
  await sync(t);
  const before = await t.run(async (ctx) => ({
    models: await ctx.db.query("models").take(100),
    providers: await ctx.db.query("providers").take(100),
    history: await ctx.db.query("priceChanges").take(100),
  }));
  server.body = fixtureJson((c) => {
    for (const provider of Object.values(c)) {
      provider.name = "Changed";
      for (const model of Object.values(provider.models)) delete model.cost;
    }
  });
  server.etag = '"unpriced"';
  await t.run(async (ctx) => {
    const row = requireValue(await ctx.db.query("syncState").first());
    await ctx.db.patch("syncState", row._id, { lastCheckedAt: 1 });
  });
  expect(await sync(t, false)).toMatchObject({
    status: "partial",
    updated: 0,
    added: 0,
    priceChanges: 0,
    removalSkipped: true,
  });
  expect(
    await t.run(async (ctx) => ({
      models: await ctx.db.query("models").take(100),
      providers: await ctx.db.query("providers").take(100),
      history: await ctx.db.query("priceChanges").take(100),
    })),
  ).toEqual(before);
  expect(await sync(t, true)).toMatchObject({ status: "ok", updated: 19 });
});

test("finding 7: failed sources remain ordered diagnostics including successful fallback", async () => {
  const t = componentTest();
  await relaxGuards(t);
  stubFetch((call) =>
    call.url.includes("models.dev")
      ? new Response("secret", { status: 502 })
      : new Response("bad json"),
  );
  const primary = {
    source: "primary",
    code: "MODELS_DEV_FETCH_FAILED",
    message: "The catalog request failed.",
    providerStatus: 502,
  };
  const fallback = {
    source: "fallback",
    code: "MODELS_DEV_INVALID_CATALOG",
    message: "The catalog is malformed.",
  };
  expect(await sync(t)).toMatchObject({ status: "error", errors: [primary, fallback] });
  expect(await t.query(api.sync.status, {})).toMatchObject({ errors: [primary, fallback] });
  stubFetch((call) =>
    call.url.includes("models.dev")
      ? new Response(null, { status: 502 })
      : new Response(fixtureJson()),
  );
  expect(await sync(t)).toMatchObject({ status: "ok", errors: [primary] });
  expect(await t.query(api.sync.status, {})).toMatchObject({ errors: [primary] });
});

test("finding 9: malformed providers preserve stored rows while healthy providers sync", async () => {
  const t = componentTest();
  await relaxGuards(t);
  const server = catalogServer({ body: fixtureJson() });
  await sync(t);
  const before = await t.query(api.models.get, { providerId: "openai", modelId: "gpt-5.4" });
  for (const [index, broken] of [
    null,
    { models: "bad" },
    { name: "x".repeat(20000), models: {} },
    { name: 42, models: {} },
  ].entries()) {
    server.body = fixtureJson((c) => {
      Object.assign(c, { openai: broken });
      rawModel(c, "anthropic", "claude-sonnet-4-5").description = `Healthy update ${index}`;
    });
    server.etag = JSON.stringify(broken);
    expect(await sync(t)).toMatchObject({ status: "ok", updated: 1 });
    expect(await t.query(api.models.get, { providerId: "openai", modelId: "gpt-5.4" })).toEqual(
      before,
    );
    expect(await t.query(api.providers.get, { providerId: "openai" })).not.toBeNull();
  }
  await t.mutation(api.config.configure, { minProviders: 5 });
  server.etag = '"floor"';
  server.body = server.body + " ";
  expect(await sync(t)).toMatchObject({
    status: "error",
    error: { code: "MODELS_DEV_CATALOG_TOO_SMALL" },
  });
});

test("price-loss guard permits exactly 20 percent and counts only stored priced models", async () => {
  const t = componentTest();
  await relaxGuards(t);
  const template = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
  const initial = {
    p: {
      models: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`m-${i}`, { ...template }])),
    },
  };
  const server = catalogServer({ body: JSON.stringify(initial) });
  await sync(t);
  const degraded = structuredClone(initial);
  for (const id of ["m-0", "m-1"]) delete requireValue(degraded.p.models[id]).cost;
  for (let i = 0; i < 20; i++) degraded.p.models[`new-${i}`] = { ...template };
  server.body = JSON.stringify(degraded);
  server.etag = '"twenty-percent"';
  await t.run(async (ctx) => {
    const row = requireValue(await ctx.db.query("syncState").first());
    await ctx.db.patch("syncState", row._id, { lastCheckedAt: 1 });
  });
  expect(await sync(t, false)).toMatchObject({ status: "ok", updated: 2, added: 20 });
  expect(await t.query(api.models.get, { providerId: "p", modelId: "m-0" })).toMatchObject({
    hasCost: false,
  });
});
