import { listCheapest } from "./models.js";
import { afterEach, expect, test, vi, describe } from "vitest";
import { api, internal } from "./_generated/api.js";
import {
  catalogServer,
  expectModelsDevError,
  relaxGuards,
  required,
  setupTest,
  type TestCtx,
} from "../test-helpers.js";
import {
  fixtureJson,
  fixtureModel,
  fixtureCatalog,
  rawModel,
  modelsOf,
  providerOf,
  type RawModel,
  FIXTURE_MODEL_COUNT,
  FIXTURE_PROVIDER_COUNT,
  type Catalog,
} from "../fixtures/index.js";
import { normalizeModel } from "../shared/normalize.js";
import { estimateCost } from "../shared/cost.js";

async function syncedCatalog(mutate?: (c: Catalog) => void) {
  const t = setupTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson(mutate) });
  await t.action(api.sync.runForced, {});
  return t;
}

const page = { numItems: 100, cursor: null };
const ids = (rows: { modelsDevProviderId: string; modelsDevModelId: string }[]) =>
  rows.map((m) => `${m.modelsDevProviderId}/${m.modelsDevModelId}`);

afterEach(() => vi.unstubAllGlobals());

describe("get, getByKey, resolve", () => {
  test("get returns the exact provider/model pair", async () => {
    const t = await syncedCatalog();
    const row = await t.query(api.models.get, {
      modelsDevProviderId: "azure",
      modelsDevModelId: "gpt-5.4",
    });
    expect(row).toMatchObject({
      modelsDevProviderId: "azure",
      modelsDevModelId: "gpt-5.4",
      hasCost: true,
    });
    expect(
      await t.query(api.models.get, { modelsDevProviderId: "azure", modelsDevModelId: "nope" }),
    ).toBeNull();
  });

  test("getByKey accepts provider/model and provider:model", async () => {
    const t = await syncedCatalog();
    for (const key of ["openai/gpt-5.4", "openai:gpt-5.4"]) {
      expect(await t.query(api.models.getByKey, { key })).toMatchObject({
        modelsDevProviderId: "openai",
        modelsDevModelId: "gpt-5.4",
      });
    }
    expect(await t.query(api.models.getByKey, { key: "nobody/gpt-5.4" })).toBeNull();
    expect(await t.query(api.models.getByKey, { key: "gpt-5.4" })).toBeNull();
    expect(await t.query(api.models.getByKey, { key: "openai/" })).toBeNull();
  });

  test("getByKey looks at no more than 8 provider prefixes", async () => {
    const t = await syncedCatalog((c) => {
      const base = providerOf(c, "azure");
      const shallow = "p/q";
      const deep = "a/b/c/d/e/f/g/h/i/j";
      c[shallow] = { ...base, id: shallow, models: { m: rawModel(c, "azure", "gpt-4o") } };
      c[deep] = { ...base, id: deep, models: { m: rawModel(c, "azure", "gpt-4o") } };
    });
    expect(await t.query(api.models.getByKey, { key: "p/q/m" })).toMatchObject({
      modelsDevProviderId: "p/q",
      modelsDevModelId: "m",
    });
    expect(await t.query(api.models.getByKey, { key: "a/b/c/d/e/f/g/h/i/j/m" })).toBeNull();
    expect(await t.query(api.models.getByKey, { key: "/m" })).toBeNull();
  });

  test("getByKey keeps separators that belong to the model id", async () => {
    const t = await syncedCatalog((c) => {
      modelsOf(c, "azure")["org/odd:id"] = { ...rawModel(c, "azure", "gpt-4o"), id: "org/odd:id" };
    });
    expect(await t.query(api.models.getByKey, { key: "azure/org/odd:id" })).toMatchObject({
      modelsDevProviderId: "azure",
      modelsDevModelId: "org/odd:id",
    });
  });

  test("resolve maps AI SDK provider strings to catalog rows", async () => {
    const t = await syncedCatalog();
    const hit = async (provider: string, model: string, aliases?: Record<string, string>) =>
      (await t.query(api.models.resolve, { provider, model, ...(aliases && { aliases }) }))
        ?.modelsDevProviderId ?? null;
    expect(await hit("openai.responses", "gpt-5.4")).toBe("openai");
    expect(await hit("google.generative-ai", "gemini-2.5-pro")).toBe("google");
    expect(await hit("azure.chat", "gpt-5.4")).toBe("azure");
    expect(await hit("anthropic.messages", "claude-sonnet-4-5")).toBe("anthropic");
    expect(await hit("openai.chat", "missing")).toBeNull();
    expect(await hit("my-openai", "gpt-5.4", { "my-openai": "openai" })).toBe("openai");
  });
});

describe("providers", () => {
  test("list and get", async () => {
    const t = await syncedCatalog();
    const providers = await t.query(api.providers.list, {});
    expect(providers.map((p) => p.modelsDevProviderId).toSorted()).toEqual([
      "anthropic",
      "azure",
      "deepinfra",
      "deepseek",
      "google",
      "novita-ai",
      "nvidia",
      "openai",
    ]);
    expect(providers).toHaveLength(FIXTURE_PROVIDER_COUNT);
    const anthropic = await t.query(api.providers.get, { modelsDevProviderId: "anthropic" });
    expect(anthropic).toMatchObject({ name: "Anthropic", npm: "@ai-sdk/anthropic", modelCount: 4 });
    expect(await t.query(api.providers.get, { modelsDevProviderId: "nope" })).toBeNull();
  });
});

describe("list", () => {
  test("excludes deprecated by default and includes them on request", async () => {
    const t = await syncedCatalog();
    const normal = await t.query(api.models.list, { paginationOpts: page });
    expect(normal.page.some((m) => m.status === "deprecated")).toBe(false);
    const all = await t.query(api.models.list, { includeDeprecated: true, paginationOpts: page });
    expect(all.page).toHaveLength(FIXTURE_MODEL_COUNT);
    const only = await t.query(api.models.list, { status: "deprecated", paginationOpts: page });
    expect(ids(only.page).toSorted()).toEqual([
      "azure/gpt-4o",
      "deepseek/deepseek-v4-flash-vision-exp",
      "openai/gpt-3.5-turbo",
    ]);
  });

  test("orders by release date by default, newest first", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, { includeDeprecated: true, paginationOpts: page });
    const dates = res.page.map((m) => m.releaseDate);
    expect(dates).toEqual([...dates].toSorted().toReversed());
  });

  test("filters by provider, family, capabilities and limits", async () => {
    const t = await syncedCatalog();
    const list = async (args: Record<string, unknown>) =>
      ids((await t.query(api.models.list, { ...args, paginationOpts: page })).page);
    expect(
      (await list({ modelsDevProviderId: "anthropic" })).every((k) => k.startsWith("anthropic/")),
    ).toBe(true);
    expect(await list({ family: "gemini-flash" })).toHaveLength(2);
    expect(await list({ modelsDevProviderId: "openai", reasoning: true })).toContain(
      "openai/gpt-5.4",
    );
    expect(await list({ modelsDevProviderId: "openai", toolCall: false })).toContain(
      "openai/gpt-image-1-mini",
    );
    expect((await list({ inputModalities: ["audio"] })).toSorted()).toEqual([
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-3.5-flash",
      "nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    ]);
    expect(
      await list({ inputModalities: ["audio", "video"], modelsDevProviderId: "google" }),
    ).toHaveLength(3);
    expect(await list({ outputModalities: ["audio"] })).toEqual(["google/lyria-3-pro-preview"]);
    expect(await list({ outputModalities: ["video"] })).toEqual([]);
    expect(
      (await list({ minContextTokens: 1_000_000 })).every((k) => !k.endsWith("claude-opus-4-5")),
    ).toBe(true);
    expect(await list({ maxCostInput: 0.3 })).toEqual(
      expect.arrayContaining([
        "openai/gpt-5-mini",
        "google/lyria-3-pro-preview",
        "google/gemini-2.5-flash",
      ]),
    );
    expect(await list({ maxCostInput: 0.3 })).not.toContain("openai/gpt-image-1-mini");
    expect(await list({ modelsDevProviderId: "azure", openWeights: true })).toEqual([
      "azure/deepseek-v4.1-flash",
    ]);
  });

  test("order by context and by cost", async () => {
    const t = await syncedCatalog();
    const byContext = await t.query(api.models.list, { order: "context", paginationOpts: page });
    const contexts = byContext.page.map((m) => m.limit.context);
    expect(contexts).toEqual([...contexts].toSorted((a, b) => b - a));
    const byCost = await t.query(api.models.list, { order: "cost", paginationOpts: page });
    const costs = byCost.page.map((m) => m.costBlended);
    expect(costs.every((c) => c !== undefined)).toBe(true);
    expect(costs).toEqual([...costs].toSorted((a, b) => (a ?? 0) - (b ?? 0)));
    expect(byCost.page.some((m) => m.modelsDevModelId === "gpt-image-1-mini")).toBe(false);
  });

  test("paginates", async () => {
    const t = await syncedCatalog();
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const res: Awaited<ReturnType<typeof t.query<typeof api.models.list>>> = await t.query(
        api.models.list,
        {
          includeDeprecated: true,
          paginationOpts: { numItems: 5, cursor },
        },
      );
      seen.push(...ids(res.page));
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    expect(seen).toHaveLength(FIXTURE_MODEL_COUNT);
    expect(new Set(seen).size).toBe(FIXTURE_MODEL_COUNT);
  });
});

describe("search", () => {
  test("matches name, id and family", async () => {
    const t = await syncedCatalog();
    const gem = await t.query(api.models.search, { query: "Gemini" });
    expect(ids(gem).every((k) => k.includes("gemini"))).toBe(true);
    expect(gem.length).toBeGreaterThanOrEqual(3);
    expect(
      ids(await t.query(api.models.search, { query: "sonnet", modelsDevProviderId: "azure" })),
    ).toEqual(["azure/claude-sonnet-4-5"]);
    expect(
      ids(await t.query(api.models.search, { query: "gemini", family: "gemini-pro" })),
    ).toEqual(["google/gemini-2.5-pro"]);
  });

  test("empty queries and limits", async () => {
    const t = await syncedCatalog();
    expect(await t.query(api.models.search, { query: "   " })).toEqual([]);
    expect(await t.query(api.models.search, { query: "gpt", limit: 2 })).toHaveLength(2);
  });
});

describe("cheapest", () => {
  test("ranks by blended cost, never returns models without cost", async () => {
    const t = await syncedCatalog();
    const cheapest = async (modelsDevProviderIds: string[]) =>
      (
        await t.query(api.models.listCheapest, {
          modelsDevProviderIds,
          limit: 20,
          excludeDeprecated: false,
        })
      ).models;
    const first = await cheapest(["openai", "google", "anthropic"]);
    const rest = await cheapest(["azure", "deepseek", "deepinfra", "nvidia", "novita-ai"]);
    for (const rows of [first, rest]) {
      expect(rows.every((m) => m.hasCost)).toBe(true);
      const costs = rows.map((m) => m.costBlended);
      expect(costs).toEqual([...costs].toSorted((a, b) => (a ?? 0) - (b ?? 0)));
    }
    expect(first.length + rest.length).toBe(FIXTURE_MODEL_COUNT - 3);
  });

  test("applies capability filters and the free/deprecated switches", async () => {
    const t = await syncedCatalog();
    const { models: defaults } = await t.query(api.models.listCheapest, { toolCall: true });
    expect(defaults.map((m) => m.status)).not.toContain("deprecated");
    expect(defaults.every((m) => m.toolCall)).toBe(true);
    const { models: free } = await t.query(api.models.listCheapest, { limit: 2 });
    expect(free.every((m) => m.costBlended === 0)).toBe(true);
    expect(ids(free).toSorted()).toEqual([
      "google/lyria-3-pro-preview",
      "nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    ]);
    const { models: paid } = await t.query(api.models.listCheapest, {
      excludeFree: true,
      limit: 1,
    });
    expect(paid[0]?.costBlended).toBeGreaterThan(0);
    const { models: ctx } = await t.query(api.models.listCheapest, {
      minContextTokens: 1_000_000,
      excludeFree: true,
      limit: 3,
    });
    expect(ctx.every((m) => m.limit.context >= 1_000_000)).toBe(true);
    const { models: audio } = await t.query(api.models.listCheapest, {
      inputModalities: ["audio"],
      limit: 20,
    });
    expect(ids(audio).toSorted()).toEqual([
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-3.5-flash",
      "nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    ]);
    const { models: scoped } = await t.query(api.models.listCheapest, {
      modelsDevProviderIds: ["anthropic"],
      limit: 20,
    });
    expect(scoped.every((m) => m.modelsDevProviderId === "anthropic")).toBe(true);
    expect(scoped[0]?.modelsDevModelId).toBe("claude-haiku-4-5");
  });

  test("distinctCanonical collapses gateways serving the same model", async () => {
    const t = await syncedCatalog((c) => {
      rawModel(c, "openai", "gpt-5.4").canonical_model_id = "openai/gpt-5.4";
    });
    const { models: plain } = await t.query(api.models.listCheapest, {
      modelsDevProviderIds: ["openai", "azure"],
      limit: 20,
    });
    expect(plain.filter((m) => m.modelsDevModelId === "gpt-5.4")).toHaveLength(2);
    const { models: distinct } = await t.query(api.models.listCheapest, {
      modelsDevProviderIds: ["openai", "azure"],
      limit: 20,
      distinctCanonical: true,
    });
    expect(distinct.filter((m) => m.modelsDevModelId === "gpt-5.4")).toHaveLength(1);
  });
});

describe("cheapest over large ties", () => {
  test("walks past more than 500 tied rows to reach later matches", async () => {
    const t = setupTest();
    await relaxGuards(t);
    catalogServer({
      body: fixtureJson((c) => {
        const tpl = rawModel(c, "openai", "gpt-5-mini");
        const big: Record<string, RawModel> = {};
        for (let i = 0; i < 620; i++) {
          big[`tie-${i}`] = {
            ...tpl,
            id: `tie-${i}`,
            limit: { context: i >= 550 ? 2_000_000 : 1000, output: 10 },
          };
        }
        providerOf(c, "openai").models = big;
      }),
    });
    await t.action(api.sync.runForced, {});
    const { models: rows } = await t.query(api.models.listCheapest, {
      minContextTokens: 2_000_000,
      limit: 20,
      excludeDeprecated: false,
    });
    expect(rows).toHaveLength(20);
    expect(rows.every((m) => m.limit.context === 2_000_000)).toBe(true);
  });
});

describe("list keeps the requested order under filters", () => {
  test("provider plus cost order is cheapest first", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, {
      modelsDevProviderId: "google",
      order: "cost",
      includeDeprecated: true,
      paginationOpts: page,
    });
    const costs = res.page.map((m) => m.costBlended ?? -1);
    expect(res.page.length).toBeGreaterThan(1);
    expect(res.page.every((m) => m.modelsDevProviderId === "google" && m.hasCost)).toBe(true);
    expect(costs).toEqual(costs.toSorted((a, b) => a - b));
  });

  test("provider plus context order is largest first", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, {
      modelsDevProviderId: "azure",
      order: "context",
      includeDeprecated: true,
      paginationOpts: page,
    });
    const ctxs = res.page.map((m) => m.limit.context);
    expect(ctxs).toEqual(ctxs.toSorted((a, b) => b - a));
    expect(res.page.every((m) => m.modelsDevProviderId === "azure")).toBe(true);
  });

  test("family plus cost order is cheapest first", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, {
      family: "gemini-flash",
      order: "cost",
      paginationOpts: page,
    });
    const costs = res.page.map((m) => m.costBlended ?? -1);
    expect(res.page).toHaveLength(2);
    expect(costs).toEqual(costs.toSorted((a, b) => a - b));
  });

  test("minContextTokens plus release order stays newest first", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, {
      minContextTokens: 1_000_000,
      includeDeprecated: true,
      paginationOpts: page,
    });
    expect(res.page.length).toBeGreaterThan(1);
    expect(res.page.every((m) => m.limit.context >= 1_000_000)).toBe(true);
    const dates = res.page.map((m) => m.releaseDate);
    expect(dates).toEqual(dates.toSorted().toReversed());
  });

  test("minContextTokens plus context order respects the floor and order", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, {
      minContextTokens: 1_000_000,
      order: "context",
      modelsDevProviderId: "openai",
      paginationOpts: page,
    });
    const ctxs = res.page.map((m) => m.limit.context);
    expect(res.page.length).toBeGreaterThan(0);
    expect(ctxs.every((c) => c >= 1_000_000)).toBe(true);
    expect(ctxs).toEqual(ctxs.toSorted((a, b) => b - a));
  });
});

describe("equivalents and priceHistory", () => {
  test("equivalents lists every provider for a canonical model, cheapest first", async () => {
    const t = await syncedCatalog((c) => {
      rawModel(c, "openai", "gpt-5.4").canonical_model_id = "openai/gpt-5.4";
      Object.assign(rawModel(c, "azure", "gpt-5.4").cost ?? {}, { input: 2 });
    });
    const rows = await t.query(api.models.listEquivalents, {
      modelsDevCanonicalModelId: "openai/gpt-5.4",
    });
    expect(ids(rows)).toEqual(["azure/gpt-5.4", "openai/gpt-5.4"]);
    expect(
      await t.query(api.models.listEquivalents, { modelsDevCanonicalModelId: "nope/none" }),
    ).toEqual([]);
  });

  test("priceHistory is empty for unchanged models and newest first otherwise", async () => {
    const t = await syncedCatalog();
    expect(
      await t.query(api.models.listPriceChanges, {
        modelsDevProviderId: "openai",
        modelsDevModelId: "gpt-5.4",
      }),
    ).toEqual([]);
    await t.run(async (ctx) => {
      for (const changedAt of [1, 3, 2]) {
        await ctx.db.insert("priceChanges", {
          modelsDevProviderId: "openai",
          modelsDevModelId: "gpt-5.4",
          changedAt,
          kind: "price",
        });
      }
    });
    const history = await t.query(api.models.listPriceChanges, {
      modelsDevProviderId: "openai",
      modelsDevModelId: "gpt-5.4",
      limit: 2,
    });
    expect(history.map((h) => h.changedAt)).toEqual([3, 2]);
  });
});

describe("estimate", () => {
  test("resolves the provider string and prices usage from the stored row", async () => {
    const t = await syncedCatalog();
    const e = await t.query(api.models.estimateCost, {
      mode: null,
      inputTokenScope: "includesCache",
      provider: "anthropic.messages",
      model: "claude-sonnet-4-5",
      usage: { inputTokens: 1000, outputTokens: 500 },
    });
    expect(e).toMatchObject({ known: true, nanoUsd: 10_500_000, tier: null, mode: null });
    if (e.known) expect(e.modelUpdatedAt).toBeGreaterThan(0);
  });

  test("applies tiers, modes and the cache semantics flag", async () => {
    const t = await syncedCatalog();
    const tiered = await t.query(api.models.estimateCost, {
      mode: null,
      inputTokenScope: "includesCache",
      provider: "openai",
      model: "gpt-5.4",
      usage: { inputTokens: 272_001 },
    });
    expect(tiered).toMatchObject({ known: true, tier: 272_000 });
    const fast = await t.query(api.models.estimateCost, {
      inputTokenScope: "includesCache",
      provider: "openai",
      model: "gpt-5.4",
      usage: { inputTokens: 1000, outputTokens: 1000 },
      mode: "fast",
    });
    expect(fast).toMatchObject({ known: true, nanoUsd: 35_000_000, mode: "fast" });
    const raw = await t.query(api.models.estimateCost, {
      mode: null,
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      usage: { inputTokens: 2000, cacheReadTokens: 6000, cacheWriteTokens: 2000 },
      inputTokenScope: "excludesCache",
    });
    expect(raw).toMatchObject({ known: true, nanoUsd: 6_000_000 + 1_800_000 + 7_500_000 });
  });

  test("unknown model or missing price is unknown, not zero", async () => {
    const t = await syncedCatalog();
    expect(
      await t.query(api.models.estimateCost, {
        mode: null,
        inputTokenScope: "includesCache",
        provider: "openai",
        model: "nope",
        usage: { inputTokens: 1 },
      }),
    ).toEqual({ known: false });
    expect(
      await t.query(api.models.estimateCost, {
        mode: null,
        inputTokenScope: "includesCache",
        provider: "openai",
        model: "gpt-image-1-mini",
        usage: { inputTokens: 1 },
      }),
    ).toEqual({ known: false });
  });
});

describe("list pagination bounds", () => {
  test("a page pinned by endCursor ends there when rows change between reads", async () => {
    const t = await syncedCatalog();
    const first = await t.query(api.models.list, { paginationOpts: { numItems: 3, cursor: null } });
    expect(first.page).toHaveLength(3);
    const next = await t.query(api.models.list, {
      paginationOpts: { numItems: 3, cursor: first.continueCursor },
    });

    await t.run((ctx) =>
      ctx.db.insert("models", {
        ...fixtureModel("openai", "gpt-5.4"),
        modelsDevModelId: "newest",
        releaseDate: "2099-01-01",
        contentHash: "h",
        firstSeenAt: 0,
        updatedAt: 0,
      }),
    );
    const reread = await t.query(api.models.list, {
      paginationOpts: { numItems: 5, cursor: null, endCursor: first.continueCursor },
    });
    expect(reread.continueCursor).toBe(first.continueCursor);
    expect(ids(reread.page)).toEqual(["openai/newest", ...ids(first.page)]);
    const following = await t.query(api.models.list, {
      paginationOpts: { numItems: 3, cursor: reread.continueCursor },
    });
    expect(ids(following.page)).toEqual(ids(next.page));
  });

  test("caller read budgets are ignored", async () => {
    const t = await syncedCatalog();
    const unbudgeted = await t.query(api.models.list, {
      includeDeprecated: true,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const budgeted = await t.query(api.models.list, {
      includeDeprecated: true,
      paginationOpts: { numItems: 10, cursor: null, maximumRowsRead: 2, maximumBytesRead: 1 },
    });
    expect(budgeted.page).toHaveLength(10);
    expect(budgeted).toEqual(unbudgeted);
  });

  test("maximumRowsRead cannot exceed numItems plus one", async () => {
    const t = setupTest();
    const base = fixtureModel("openai", "gpt-5.4");
    await t.run(async (ctx) => {
      for (let i = 0; i < 102; i++) {
        await ctx.db.insert("models", {
          ...base,
          modelsDevModelId: `m-${i}`,
          releaseDate: `2020-01-${String(i).padStart(5, "0")}`,
          contentHash: "h",
          firstSeenAt: 0,
          updatedAt: 0,
        });
      }
    });
    const args = {
      reasoning: !base.reasoning,
      paginationOpts: { numItems: 100, cursor: null as string | null, maximumRowsRead: 1e9 },
    };
    const first = await t.query(api.models.list, args);
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);
    const second = await t.query(api.models.list, {
      ...args,
      paginationOpts: { ...args.paginationOpts, cursor: first.continueCursor },
    });
    expect(second.page).toEqual([]);
    expect(second.isDone).toBe(true);
  }, 60_000);
});

const sync = (t: TestCtx, force = true) => t.action(force ? api.sync.runForced : api.sync.run, {});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("disabled ticks and changed retention preserve history", async () => {
  const t = setupTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson() });
  const changedAt = Date.now() - 40 * 86400000;
  await t.run((ctx) =>
    ctx.db.insert("priceChanges", {
      modelsDevProviderId: "p",
      modelsDevModelId: "m",
      changedAt,
      kind: "price",
    }),
  );
  await t.mutation(api.config.update, { enabled: false, retentionDays: 30 });
  await t.action(internal.sync.tick, {});
  expect(
    await t.query(api.models.listPriceChanges, { modelsDevProviderId: "p", modelsDevModelId: "m" }),
  ).toHaveLength(1);
  await t.mutation(api.config.update, { enabled: true, retentionDays: 365 });
  await t.mutation(internal.sync.cleanupPriceChanges, {});
  expect(
    await t.query(api.models.listPriceChanges, { modelsDevProviderId: "p", modelsDevModelId: "m" }),
  ).toHaveLength(1);
});

test("equivalents selects the cheapest provider before applying the limit", async () => {
  const t = setupTest();
  await t.run(async (ctx) => {
    for (const [modelsDevProviderId, price] of [
      ["expensive", 10],
      ["cheap", 1],
    ] as const)
      await ctx.db.insert("models", {
        ...fixtureModel("openai", "gpt-5.4"),
        modelsDevProviderId,
        modelsDevCanonicalModelId: "canonical",
        costBlended: price,
        costOrder: -price,
        contentHash: "h",
        firstSeenAt: 0,
        updatedAt: 0,
      });
  });
  expect(
    await t.query(api.models.listEquivalents, { modelsDevCanonicalModelId: "canonical", limit: 1 }),
  ).toMatchObject([{ modelsDevProviderId: "cheap" }]);
});

test("equivalents sorts the largest finite price before unpriced models", async () => {
  const t = setupTest();
  const raw = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
  await t.run(async (ctx) => {
    for (const [modelsDevProviderId, cost] of [
      ["unpriced", undefined],
      ["priced", { input: Number.MAX_VALUE, output: Number.MAX_VALUE }],
    ] as const) {
      const row = required(
        normalizeModel(modelsDevProviderId, "m", {
          ...raw,
          cost,
          canonical_model_id: "extreme",
        }),
        "normalized model",
      );
      await ctx.db.insert("models", { ...row, contentHash: "h", firstSeenAt: 0, updatedAt: 0 });
    }
  });
  expect(
    (await t.query(api.models.listEquivalents, { modelsDevCanonicalModelId: "extreme" })).map(
      (row) => row.modelsDevProviderId,
    ),
  ).toEqual(["priced", "unpriced"]);
});

test("unknown modality filters are rejected", async () => {
  const t = setupTest();
  await expectModelsDevError(
    t.query(api.models.listCheapest, { inputModalities: ["typo"] }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
  await expectModelsDevError(
    t.query(api.models.list, {
      outputModalities: ["typo"],
      paginationOpts: { numItems: 5, cursor: null },
    }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
});

test.each([
  "not-json",
  "{}",
  "null",
  "[{}]",
  JSON.stringify(Array(17).fill(1)),
  `["${"a".repeat(4094)}"]`,
])("malformed cursor %s has a package error", async (cursor) => {
  const t = setupTest();
  for (const paginationOpts of [
    { numItems: 5, cursor },
    { numItems: 5, cursor: null, endCursor: cursor },
  ])
    await expectModelsDevError(
      t.query(api.models.list, { paginationOpts }),
      "MODELS_DEV_INVALID_ARGUMENT",
    );
});

test("numeric query bounds reject NaN and infinity", async () => {
  const t = setupTest();
  await expectModelsDevError(
    t.query(api.models.listCheapest, { limit: NaN }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
  await expectModelsDevError(
    t.query(api.models.search, { query: "x", limit: NaN }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
  await expectModelsDevError(
    t.query(api.models.listEquivalents, { modelsDevCanonicalModelId: "x", limit: NaN }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
  await expectModelsDevError(
    t.query(api.models.listPriceChanges, {
      modelsDevProviderId: "p",
      modelsDevModelId: "m",
      limit: NaN,
    }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
  await expectModelsDevError(
    t.query(api.models.list, { paginationOpts: { numItems: NaN, cursor: null } }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
});

test("list preserves pinned split metadata", async () => {
  const t = setupTest();
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

test("invalid usage throws before model resolution", async () => {
  const t = setupTest();
  for (const count of [NaN, -1, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
      estimateCost(
        { costInput: 1, costOutput: 1 },
        { inputTokens: count },
        { mode: null, inputTokenScope: "includesCache" },
      ),
    ).toThrow();
    await expectModelsDevError(
      t.query(api.models.estimateCost, {
        mode: null,
        inputTokenScope: "includesCache",
        provider: "missing",
        model: "missing",
        usage: { outputTokens: count },
      }),
      "MODELS_DEV_INVALID_ARGUMENT",
    );
  }
  expect(() =>
    estimateCost(
      {},
      { inputTokens: 1, promptTokens: -1 },
      { mode: null, inputTokenScope: "includesCache" },
    ),
  ).toThrow();
});

test("an unpriced requested mode is unknown", async () => {
  const modeModel = {
    costInput: 1,
    costOutput: 2,
    modes: {
      empty: { cost: {} },
      tiersOnly: { tiers: [{ size: 100, input: 3, output: 4 }] },
    },
  };
  expect(
    estimateCost(
      modeModel,
      { inputTokens: 10 },
      { inputTokenScope: "includesCache", mode: "empty" },
    ),
  ).toEqual({ known: false });
  expect(
    estimateCost(
      modeModel,
      { inputTokens: 10 },
      { inputTokenScope: "includesCache", mode: "tiersOnly" },
    ),
  ).toEqual({
    known: false,
  });
  expect(
    estimateCost(
      modeModel,
      { inputTokens: 101 },
      { inputTokenScope: "includesCache", mode: "tiersOnly" },
    ),
  ).toMatchObject({
    known: true,
    nanoUsd: 303000,
    mode: "tiersOnly",
  });
  expect(
    estimateCost(
      fixtureModel("openai", "gpt-5.4"),
      { inputTokens: 10 },
      { inputTokenScope: "includesCache", mode: "absent" },
    ),
  ).toEqual({ known: false });
  const t = setupTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson() });
  await sync(t);
  expect(
    await t.query(api.models.estimateCost, {
      inputTokenScope: "includesCache",
      provider: "openai",
      model: "gpt-5.4",
      usage: { inputTokens: 10 },
      mode: "absent",
    }),
  ).toEqual({ known: false });
});

const CHEAPEST_SCAN_BOUND = 1927;

test("provider cheapest reads past unrelated rows and reports scan truncation", async () => {
  const t = setupTest();
  const base = fixtureModel("openai", "gpt-5.4");
  await t.run(async (ctx) => {
    for (let i = 0; i <= CHEAPEST_SCAN_BOUND; i++)
      await ctx.db.insert("models", {
        ...base,
        modelsDevProviderId: "unrelated",
        modelsDevModelId: `m-${i}`,
        costBlended: 0,
        contentHash: "h",
        firstSeenAt: 0,
        updatedAt: 0,
      });
    for (const [modelsDevProviderId, costBlended] of [
      ["wanted", 5],
      ["other", 2],
    ] as const)
      await ctx.db.insert("models", {
        ...base,
        modelsDevProviderId,
        costBlended,
        contentHash: "h",
        firstSeenAt: 0,
        updatedAt: 0,
      });
  });
  const result = await t.query(api.models.listCheapest, {
    modelsDevProviderIds: ["wanted", "other", "wanted"],
    limit: 5,
  });
  expect(result).toMatchObject({
    models: [{ modelsDevProviderId: "other" }, { modelsDevProviderId: "wanted" }],
    isComplete: true,
  });
  expect(await t.query(api.models.listCheapest, { reasoning: !base.reasoning })).toEqual({
    models: [],
    isComplete: false,
  });
  await expectModelsDevError(
    t.query(api.models.listCheapest, { modelsDevProviderIds: [] }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
}, 60000);

test("cheapest reads exactly the 1927-row scan bound and stops before row 1928", async () => {
  const t = setupTest();
  const base = fixtureModel("openai", "gpt-5.4");
  await t.run(async (ctx) => {
    for (let i = 0; i <= CHEAPEST_SCAN_BOUND; i++)
      await ctx.db.insert("models", {
        ...base,
        modelsDevModelId: `scan-${i}`,
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
    const handler = Reflect.get(listCheapest, "_handler") as (
      context: typeof ctx,
      args: { reasoning: boolean },
    ) => Promise<unknown>;
    expect(await handler({ ...ctx, db }, { reasoning: !base.reasoning })).toEqual({
      models: [],
      isComplete: false,
    });
  });
  expect(reads).toBe(CHEAPEST_SCAN_BOUND);
}, 60000);

test("the type filter selects one model type or models without a type", async () => {
  const t = await syncedCatalog();
  const listed = async (type: string | null | undefined) =>
    ids((await t.query(api.models.list, { type, paginationOpts: page })).page);
  expect(await listed("embedding")).toEqual(["novita-ai/qwen/qwen3-embedding-8b"]);
  expect(await listed(null)).not.toContain("novita-ai/qwen/qwen3-embedding-8b");
  expect(await listed(null)).toHaveLength((await listed(undefined)).length - 1);
  const cheapest = async (type: string | null | undefined) =>
    ids(
      (
        await t.query(api.models.listCheapest, {
          type,
          modelsDevProviderIds: ["novita-ai", "deepinfra"],
          limit: 20,
        })
      ).models,
    );
  expect(await cheapest(undefined)).toEqual([
    "novita-ai/qwen/qwen3-embedding-8b",
    "deepinfra/Qwen/Qwen3-32B",
  ]);
  expect(await cheapest("embedding")).toEqual(["novita-ai/qwen/qwen3-embedding-8b"]);
  expect(await cheapest(null)).toEqual(["deepinfra/Qwen/Qwen3-32B"]);
  expect(await cheapest("reranking")).toEqual([]);
});

test("listCheapest deduplicates provider IDs and rejects more than 64", async () => {
  const t = await syncedCatalog();
  const { models } = await t.query(api.models.listCheapest, {
    modelsDevProviderIds: [
      ...Array.from({ length: 70 }, () => "anthropic"),
      ...Array.from({ length: 63 }, (_, i) => `absent-${i}`),
    ],
    limit: 20,
  });
  expect(ids(models).toSorted()).toEqual([
    "anthropic/claude-haiku-4-5",
    "anthropic/claude-opus-4-5",
    "anthropic/claude-opus-4-8",
    "anthropic/claude-sonnet-4-5",
  ]);
  await expectModelsDevError(
    t.query(api.models.listCheapest, {
      modelsDevProviderIds: Array.from({ length: 65 }, (_, i) => `p-${i}`),
    }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
});
