import { afterEach, expect, test, vi } from "vitest";
import { cheapest } from "./models.js";
import { api, internal } from "./_generated/api.js";
import {
  catalogServer,
  componentTest,
  relaxGuards,
  requireValue,
  stubFetch,
} from "../test-helpers.js";
import { fixtureJson, fixtureModel, fixtureCatalog, rawModel } from "../fixtures/index.js";
import { normalizeModel, normalizeProvider } from "../shared/normalize.js";
import { estimateCost } from "../shared/cost.js";

const sync = (t: ReturnType<typeof componentTest>, force = true) =>
  t.action(api.sync.syncNow, { force });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("new models do not dilute the removal guard", async () => {
  const t = componentTest();
  await relaxGuards(t);
  const server = catalogServer({ body: fixtureJson() });
  await sync(t);
  const template = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
  server.body = JSON.stringify({
    openai: {
      name: "OpenAI",
      models: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`new-${i}`, template])),
    },
  });
  server.etag = '"new"';
  await t.run(async (ctx) => {
    const row = requireValue(await ctx.db.query("syncState").first());
    await ctx.db.patch("syncState", row._id, { lastCheckedAt: 1 });
  });
  expect(await sync(t, false)).toMatchObject({
    status: "partial",
    removed: 0,
    removalSkipped: true,
  });
  expect(
    await t.query(api.models.get, { providerId: "openai", modelId: "gpt-5.4" }),
  ).not.toBeNull();
});
test("interrupted catalog writes invalidate both cache validators", async () => {
  const t = componentTest();
  await relaxGuards(t);
  const server = catalogServer({ body: fixtureJson() });
  await sync(t);
  await t.mutation(internal.sync.begin, { runId: "interrupted", force: true, cron: false });
  await t.mutation(internal.sync.upsertModels, {
    runId: "interrupted",
    rows: [
      { ...fixtureModel("openai", "gpt-5.4"), name: "Partial catalog", contentHash: "changed" },
    ],
    recordAdded: false,
  });
  const state = requireValue(await t.run((ctx) => ctx.db.query("syncState").first()));
  expect(state.etag).toBeUndefined();
  expect(state.contentHash).toBeUndefined();
  await t.run((ctx) => ctx.db.patch("syncState", state._id, { leaseExpiresAt: 1 }));
  expect(await sync(t)).toMatchObject({ status: "ok" });
  expect(server.calls.at(-1)?.headers["if-none-match"]).toBeUndefined();
  expect(await t.query(api.models.get, { providerId: "openai", modelId: "gpt-5.4" })).toMatchObject(
    { name: fixtureModel("openai", "gpt-5.4").name },
  );
});
test.each([{ cost: "bad" }, { cost: [] }, { cost: 123 }])(
  "malformed cost preserves the stored price, case %#",
  async ({ cost }) => {
    const t = componentTest();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      Object.assign(rawModel(c, "openai", "gpt-5.4"), { cost });
    });
    server.etag = '"new"';
    expect(await sync(t)).toMatchObject({ skippedModels: 1, updated: 0 });
    expect(
      await t.query(api.models.get, { providerId: "openai", modelId: "gpt-5.4" }),
    ).toMatchObject({ costInput: 2.5 });
  },
);
test("downloads stop before buffering more than 16 MiB", async () => {
  const t = componentTest();
  await relaxGuards(t);
  let cancelled = 0;
  let chunks = 0;
  stubFetch(() => {
    let sourceChunks = 0;
    return new Response(
      new ReadableStream({
        pull(controller) {
          chunks++;
          sourceChunks++;
          if (sourceChunks === 40) controller.close();
          else controller.enqueue(new Uint8Array(1024 * 1024));
        },
        cancel() {
          cancelled++;
        },
      }),
    );
  });
  expect(await sync(t)).toMatchObject({
    status: "error",
    error: { code: "MODELS_DEV_CATALOG_TOO_LARGE" },
  });
  expect(cancelled).toBe(2);
  expect(chunks).toBeLessThan(40);
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
test("a completed source without an etag clears the previous source etag", async () => {
  const t = componentTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson() });
  await sync(t);
  await t.mutation(internal.sync.begin, { runId: "new", force: true, cron: false });
  await t.mutation(internal.sync.finish, {
    runId: "new",
    status: "ok",
    source: "https://mirror.example/api.json",
    contentHash: "new",
    durationMs: 0,
  });
  expect((await t.run((ctx) => ctx.db.query("syncState").first()))?.etag).toBeUndefined();
});
test("cost estimates reject unsafe terms and totals", () => {
  const model = { costInput: 1, costOutput: 1 };
  expect(() => estimateCost(model, { inputTokens: 1e308 })).toThrow();
  expect(estimateCost(model, { inputTokens: 5e12, outputTokens: 5e12 })).toEqual({ known: false });
});
test("sync failures never persist upstream text or broken Unicode", async () => {
  const t = componentTest();
  await relaxGuards(t);
  catalogServer({ body: JSON.stringify({ ["x".repeat(499) + "😀secret_from_body"]: null }) });
  const result = await sync(t);
  expect(result).toMatchObject({
    status: "error",
    error: {
      code: "MODELS_DEV_CATALOG_TOO_SMALL",
      message: "The catalog has fewer usable providers or models than configured.",
    },
  });
  const state = await t.run((ctx) => ctx.db.query("syncState").first());
  expect(state?.errors).toEqual(result.errors);
  expect(JSON.stringify(state)).not.toContain("secret_from_body");
});
test("disabled ticks and changed retention preserve history", async () => {
  const t = componentTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson() });
  const at = Date.now() - 40 * 86400000;
  await t.run((ctx) =>
    ctx.db.insert("priceChanges", { providerId: "p", modelId: "m", at, kind: "price" }),
  );
  await t.mutation(api.config.configure, { enabled: false, retentionDays: 30 });
  await t.action(internal.sync.tick, {});
  expect(await t.query(api.models.priceHistory, { providerId: "p", modelId: "m" })).toHaveLength(1);
  await t.mutation(api.config.configure, { enabled: true, retentionDays: 365 });
  await t.mutation(internal.sync.cleanupPriceChanges, {});
  expect(await t.query(api.models.priceHistory, { providerId: "p", modelId: "m" })).toHaveLength(1);
});
test("equivalents selects the cheapest provider before applying the limit", async () => {
  const t = componentTest();
  await t.run(async (ctx) => {
    for (const [providerId, price] of [
      ["expensive", 10],
      ["cheap", 1],
    ] as const)
      await ctx.db.insert("models", {
        ...fixtureModel("openai", "gpt-5.4"),
        providerId,
        canonicalModelId: "canonical",
        costBlended: price,
        costOrder: -price,
        contentHash: "h",
        firstSeenAt: 0,
        updatedAt: 0,
      });
  });
  expect(
    await t.query(api.models.equivalents, { canonicalModelId: "canonical", limit: 1 }),
  ).toMatchObject([{ providerId: "cheap" }]);
});
test("equivalents sorts the largest finite price before unpriced models", async () => {
  const t = componentTest();
  const raw = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
  await t.run(async (ctx) => {
    for (const [providerId, cost] of [
      ["unpriced", undefined],
      ["priced", { input: Number.MAX_VALUE, output: Number.MAX_VALUE }],
    ] as const) {
      const row = requireValue(
        normalizeModel(providerId, "m", {
          ...raw,
          cost,
          canonical_model_id: "extreme",
        }),
      );
      await ctx.db.insert("models", { ...row, contentHash: "h", firstSeenAt: 0, updatedAt: 0 });
    }
  });
  expect(
    (await t.query(api.models.equivalents, { canonicalModelId: "extreme" })).map(
      (row) => row.providerId,
    ),
  ).toEqual(["priced", "unpriced"]);
});
test("unknown modality filters are rejected", async () => {
  const t = componentTest();
  await expect(t.query(api.models.cheapest, { inputModalities: ["typo"] })).rejects.toMatchObject({
    data: { code: "MODELS_DEV_INVALID_ARGUMENT" },
  });
  await expect(
    t.query(api.models.list, {
      outputModalities: ["typo"],
      paginationOpts: { numItems: 5, cursor: null },
    }),
  ).rejects.toMatchObject({ data: { code: "MODELS_DEV_INVALID_ARGUMENT" } });
});
test.each([{ min: -1 }, { max: Infinity }, { min: 10, max: 1 }])(
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
test.each(["not-a-date", "2026-02-30", "2026-2-01"])(
  "invalid release date %s is skipped",
  (release_date) => {
    expect(
      normalizeModel("p", "m", {
        ...rawModel(fixtureCatalog, "openai", "gpt-5-mini"),
        release_date,
      }),
    ).toBeNull();
  },
);
test("source URLs larger than 2048 UTF-8 bytes are rejected", async () => {
  const t = componentTest();
  await expect(
    t.mutation(api.config.configure, { sourceUrl: "https://example.com/" + "a".repeat(2048) }),
  ).rejects.toMatchObject({ data: { code: "MODELS_DEV_INVALID_SOURCE_URL" } });
});
test.each(["not-json", "{}", "null", "[{}]"])(
  "malformed cursor %s has a package error",
  async (cursor) => {
    const t = componentTest();
    for (const paginationOpts of [
      { numItems: 5, cursor },
      { numItems: 5, cursor: null, endCursor: cursor },
    ])
      await expect(t.query(api.models.list, { paginationOpts })).rejects.toMatchObject({
        data: { code: "MODELS_DEV_INVALID_ARGUMENT" },
      });
  },
);
test("numeric query bounds reject NaN and infinity", async () => {
  const t = componentTest();
  const invalid = { data: { code: "MODELS_DEV_INVALID_ARGUMENT" } };
  await expect(t.query(api.models.cheapest, { limit: NaN })).rejects.toMatchObject(invalid);
  await expect(t.query(api.models.search, { query: "x", limit: NaN })).rejects.toMatchObject(
    invalid,
  );
  await expect(
    t.query(api.models.equivalents, { canonicalModelId: "x", limit: NaN }),
  ).rejects.toMatchObject(invalid);
  await expect(
    t.query(api.models.priceHistory, { providerId: "p", modelId: "m", limit: NaN }),
  ).rejects.toMatchObject(invalid);
  await expect(
    t.query(api.models.list, { paginationOpts: { numItems: NaN, cursor: null } }),
  ).rejects.toMatchObject(invalid);
});
test("list honors byte budgets", async () => {
  const t = componentTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson() });
  await sync(t);
  const first = await t.query(api.models.list, {
    paginationOpts: { cursor: null, numItems: 100, maximumBytesRead: 1 },
  });
  expect(first.page.length).toBeLessThan(3);
  expect(first.pageStatus).toBe("SplitRequired");
  expect(first.splitCursor).toBeTypeOf("string");
});
test("list preserves pinned split metadata", async () => {
  const t = componentTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson() });
  await sync(t);
  const pinned = await t.query(api.models.list, {
    includeDeprecated: true,
    paginationOpts: { cursor: null, numItems: 1, endCursor: "[]", maximumRowsRead: 2 },
  });
  expect(pinned.pageStatus).toBe("SplitRequired");
  expect(pinned.splitCursor).toBeTypeOf("string");
});
test("tuple identities cannot collide during removal", async () => {
  const t = componentTest();
  await relaxGuards(t);
  const template = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
  const server = catalogServer({
    body: JSON.stringify({
      ["p\u0000q"]: { models: { m: template } },
      p: { models: { ["q\u0000m"]: template } },
    }),
  });
  await sync(t);
  server.body = JSON.stringify({ p: { models: { ["q\u0000m"]: template } } });
  server.etag = '"next"';
  expect(await sync(t)).toMatchObject({ removed: 1 });
  expect(await t.query(api.models.get, { providerId: "p\u0000q", modelId: "m" })).toBeNull();
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

test("cheapest stops before requesting row 4001", async () => {
  const t = componentTest();
  const base = fixtureModel("openai", "gpt-5.4");
  await t.run(async (ctx) => {
    for (let i = 0; i < 4001; i++)
      await ctx.db.insert("models", {
        ...base,
        modelId: `scan-${i}`,
        contentHash: "h",
        firstSeenAt: 0,
        updatedAt: 0,
      });
  });
  let reads = 0;
  await t.run(async (ctx) => {
    const ordered = ctx.db
      .query("models")
      .withIndex("by_costBlended", (q) => q.gte("costBlended", 0));
    const iterator = ordered[Symbol.asyncIterator]();
    const observed = new Proxy(ordered, {
      get(target, key, receiver) {
        if (key === Symbol.asyncIterator)
          return () => ({
            async next() {
              const result = await iterator.next();
              if (!result.done) reads++;
              return result;
            },
            async return() {
              return iterator.return ? iterator.return() : { done: true, value: undefined };
            },
          });
        return Reflect.get(target, key, receiver);
      },
    });
    const initializer = new Proxy(ctx.db.query("models"), {
      get(target, key, receiver) {
        return key === "withIndex" ? () => observed : Reflect.get(target, key, receiver);
      },
    });
    const db = new Proxy(ctx.db, {
      get(target, key, receiver) {
        return key === "query" ? () => initializer : Reflect.get(target, key, receiver);
      },
    });
    const handler = Reflect.get(cheapest, "_handler") as (
      context: typeof ctx,
      args: { reasoning: boolean },
    ) => Promise<unknown>;
    expect(await handler({ ...ctx, db }, { reasoning: !base.reasoning })).toEqual({
      models: [],
      isComplete: false,
    });
  });
  expect(reads).toBe(4000);
}, 60000);
