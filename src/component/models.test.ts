import { afterEach, describe, expect, test, vi } from "vitest";
import {
  fixtureJson,
  fixtureModel,
  modelsOf,
  providerOf,
  rawModel,
  type RawModel,
  FIXTURE_MODEL_COUNT,
  FIXTURE_PROVIDER_COUNT,
  type Catalog,
} from "../fixtures/index.js";
import { catalogServer, componentTest, relaxGuards } from "../test-helpers.js";
import { api } from "./_generated/api.js";

async function syncedCatalog(mutate?: (c: Catalog) => void) {
  const t = componentTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson(mutate) });
  await t.action(api.sync.syncNow, { force: true });
  return t;
}

const page = { numItems: 100, cursor: null };
const ids = (rows: { providerId: string; modelId: string }[]) =>
  rows.map((m) => `${m.providerId}/${m.modelId}`);

afterEach(() => vi.unstubAllGlobals());

describe("get, getByKey, resolve", () => {
  test("get returns the exact provider/model pair", async () => {
    const t = await syncedCatalog();
    const row = await t.query(api.models.get, { providerId: "azure", modelId: "gpt-5.4" });
    expect(row).toMatchObject({ providerId: "azure", modelId: "gpt-5.4", hasCost: true });
    expect(await t.query(api.models.get, { providerId: "azure", modelId: "nope" })).toBeNull();
  });

  test("getByKey accepts provider/model and provider:model", async () => {
    const t = await syncedCatalog();
    for (const key of ["openai/gpt-5.4", "openai:gpt-5.4"]) {
      expect(await t.query(api.models.getByKey, { key })).toMatchObject({
        providerId: "openai",
        modelId: "gpt-5.4",
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
      providerId: "p/q",
      modelId: "m",
    });
    expect(await t.query(api.models.getByKey, { key: "a/b/c/d/e/f/g/h/i/j/m" })).toBeNull();
    expect(await t.query(api.models.getByKey, { key: "/m" })).toBeNull();
  });

  test("getByKey keeps separators that belong to the model id", async () => {
    const t = await syncedCatalog((c) => {
      modelsOf(c, "azure")["org/odd:id"] = { ...rawModel(c, "azure", "gpt-4o"), id: "org/odd:id" };
    });
    expect(await t.query(api.models.getByKey, { key: "azure/org/odd:id" })).toMatchObject({
      providerId: "azure",
      modelId: "org/odd:id",
    });
  });

  test("resolve maps AI SDK provider strings to catalog rows", async () => {
    const t = await syncedCatalog();
    const hit = async (provider: string, model: string, aliases?: Record<string, string>) =>
      (await t.query(api.models.resolve, { provider, model, ...(aliases && { aliases }) }))
        ?.providerId ?? null;
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
    expect(providers.map((p) => p.providerId).toSorted()).toEqual([
      "anthropic",
      "azure",
      "deepseek",
      "google",
      "openai",
    ]);
    expect(providers).toHaveLength(FIXTURE_PROVIDER_COUNT);
    const anthropic = await t.query(api.providers.get, { providerId: "anthropic" });
    expect(anthropic).toMatchObject({ name: "Anthropic", npm: "@ai-sdk/anthropic", modelCount: 4 });
    expect(await t.query(api.providers.get, { providerId: "nope" })).toBeNull();
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
    expect((await list({ providerId: "anthropic" })).every((k) => k.startsWith("anthropic/"))).toBe(
      true,
    );
    expect(await list({ family: "gemini-flash" })).toHaveLength(2);
    expect(await list({ providerId: "openai", reasoning: true })).toContain("openai/gpt-5.4");
    expect(await list({ providerId: "openai", toolCall: false })).toContain(
      "openai/gpt-image-1-mini",
    );
    expect((await list({ inputModalities: ["audio"] })).toSorted()).toEqual([
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-3.5-flash",
    ]);
    expect(await list({ inputModalities: ["audio", "video"], providerId: "google" })).toHaveLength(
      3,
    );
    expect(await list({ outputModalities: ["audio"] })).toEqual(["google/lyria-3-pro-preview"]);
    expect(await list({ outputModalities: ["video"] })).toEqual([]);
    expect(
      (await list({ minContext: 1_000_000 })).every((k) => !k.endsWith("claude-opus-4-5")),
    ).toBe(true);
    expect(await list({ maxCostInput: 0.3 })).toEqual(
      expect.arrayContaining([
        "openai/gpt-5-mini",
        "google/lyria-3-pro-preview",
        "google/gemini-2.5-flash",
      ]),
    );
    expect(await list({ maxCostInput: 0.3 })).not.toContain("openai/gpt-image-1-mini");
    expect(await list({ providerId: "azure", openWeights: true })).toEqual([]);
  });

  test("order by context and by cost", async () => {
    const t = await syncedCatalog();
    const byContext = await t.query(api.models.list, { order: "context", paginationOpts: page });
    const contexts = byContext.page.map((m) => m.contextLimit);
    expect(contexts).toEqual([...contexts].toSorted((a, b) => b - a));
    const byCost = await t.query(api.models.list, { order: "cost", paginationOpts: page });
    const costs = byCost.page.map((m) => m.costBlended);
    expect(costs.every((c) => c !== undefined)).toBe(true);
    expect(costs).toEqual([...costs].toSorted((a, b) => (a ?? 0) - (b ?? 0)));
    expect(byCost.page.some((m) => m.modelId === "gpt-image-1-mini")).toBe(false);
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
    expect(ids(await t.query(api.models.search, { query: "sonnet", providerId: "azure" }))).toEqual(
      ["azure/claude-sonnet-4-5"],
    );
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
    const rows = await t.query(api.models.cheapest, { limit: 20, excludeDeprecated: false });
    expect(rows.every((m) => m.hasCost)).toBe(true);
    const costs = rows.map((m) => m.costBlended);
    expect(costs).toEqual([...costs].toSorted((a, b) => (a ?? 0) - (b ?? 0)));
    expect(rows).toHaveLength(FIXTURE_MODEL_COUNT - 2);
  });

  test("applies capability filters and the free/deprecated switches", async () => {
    const t = await syncedCatalog();
    const defaults = await t.query(api.models.cheapest, { toolCall: true });
    expect(defaults.map((m) => m.status)).not.toContain("deprecated");
    expect(defaults.every((m) => m.toolCall)).toBe(true);
    const free = await t.query(api.models.cheapest, { limit: 1 });
    expect(free[0]).toMatchObject({ modelId: "lyria-3-pro-preview", costBlended: 0 });
    const paid = await t.query(api.models.cheapest, { excludeFree: true, limit: 1 });
    expect(paid[0]?.costBlended).toBeGreaterThan(0);
    const ctx = await t.query(api.models.cheapest, {
      minContext: 1_000_000,
      excludeFree: true,
      limit: 3,
    });
    expect(ctx.every((m) => m.contextLimit >= 1_000_000)).toBe(true);
    const audio = await t.query(api.models.cheapest, { inputModalities: ["audio"], limit: 20 });
    expect(ids(audio).toSorted()).toEqual([
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-3.5-flash",
    ]);
    const scoped = await t.query(api.models.cheapest, { providerIds: ["anthropic"], limit: 20 });
    expect(scoped.every((m) => m.providerId === "anthropic")).toBe(true);
    expect(scoped[0]?.modelId).toBe("claude-haiku-4-5");
  });

  test("distinctCanonical collapses gateways serving the same model", async () => {
    const t = await syncedCatalog((c) => {
      rawModel(c, "openai", "gpt-5.4").canonical_model_id = "openai/gpt-5.4";
    });
    const plain = await t.query(api.models.cheapest, {
      providerIds: ["openai", "azure"],
      limit: 20,
    });
    expect(plain.filter((m) => m.modelId === "gpt-5.4")).toHaveLength(2);
    const distinct = await t.query(api.models.cheapest, {
      providerIds: ["openai", "azure"],
      limit: 20,
      distinctCanonical: true,
    });
    expect(distinct.filter((m) => m.modelId === "gpt-5.4")).toHaveLength(1);
  });
});

describe("cheapest over large ties", () => {
  test("walks past more than 500 tied rows to reach later matches", async () => {
    const t = componentTest();
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
    await t.action(api.sync.syncNow, { force: true });
    const rows = await t.query(api.models.cheapest, {
      minContext: 2_000_000,
      limit: 20,
      excludeDeprecated: false,
    });
    expect(rows).toHaveLength(20);
    expect(rows.every((m) => m.contextLimit === 2_000_000)).toBe(true);
  });
});

describe("list keeps the requested order under filters", () => {
  test("provider plus cost order is cheapest first", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, {
      providerId: "google",
      order: "cost",
      includeDeprecated: true,
      paginationOpts: page,
    });
    const costs = res.page.map((m) => m.costBlended ?? -1);
    expect(res.page.length).toBeGreaterThan(1);
    expect(res.page.every((m) => m.providerId === "google" && m.hasCost)).toBe(true);
    expect(costs).toEqual(costs.toSorted((a, b) => a - b));
  });

  test("provider plus context order is largest first", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, {
      providerId: "azure",
      order: "context",
      includeDeprecated: true,
      paginationOpts: page,
    });
    const ctxs = res.page.map((m) => m.contextLimit);
    expect(ctxs).toEqual(ctxs.toSorted((a, b) => b - a));
    expect(res.page.every((m) => m.providerId === "azure")).toBe(true);
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

  test("minContext plus release order stays newest first", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, {
      minContext: 1_000_000,
      includeDeprecated: true,
      paginationOpts: page,
    });
    expect(res.page.length).toBeGreaterThan(1);
    expect(res.page.every((m) => m.contextLimit >= 1_000_000)).toBe(true);
    const dates = res.page.map((m) => m.releaseDate);
    expect(dates).toEqual(dates.toSorted().toReversed());
  });

  test("minContext plus context order respects the floor and order", async () => {
    const t = await syncedCatalog();
    const res = await t.query(api.models.list, {
      minContext: 1_000_000,
      order: "context",
      providerId: "openai",
      paginationOpts: page,
    });
    const ctxs = res.page.map((m) => m.contextLimit);
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
    const rows = await t.query(api.models.equivalents, { canonicalModelId: "openai/gpt-5.4" });
    expect(ids(rows)).toEqual(["azure/gpt-5.4", "openai/gpt-5.4"]);
    expect(await t.query(api.models.equivalents, { canonicalModelId: "nope/none" })).toEqual([]);
  });

  test("priceHistory is empty for unchanged models and newest first otherwise", async () => {
    const t = await syncedCatalog();
    expect(
      await t.query(api.models.priceHistory, { providerId: "openai", modelId: "gpt-5.4" }),
    ).toEqual([]);
    await t.run(async (ctx) => {
      for (const at of [1, 3, 2]) {
        await ctx.db.insert("priceChanges", {
          providerId: "openai",
          modelId: "gpt-5.4",
          at,
          kind: "price",
        });
      }
    });
    const history = await t.query(api.models.priceHistory, {
      providerId: "openai",
      modelId: "gpt-5.4",
      limit: 2,
    });
    expect(history.map((h) => h.at)).toEqual([3, 2]);
  });
});

describe("estimate", () => {
  test("resolves the provider string and prices usage from the stored row", async () => {
    const t = await syncedCatalog();
    const e = await t.query(api.models.estimate, {
      provider: "anthropic.messages",
      model: "claude-sonnet-4-5",
      usage: { inputTokens: 1000, outputTokens: 500 },
    });
    expect(e).toMatchObject({ known: true, nanoUsd: 10_500_000, tier: null, mode: null });
    if (e.known) expect(e.priceSnapshotAt).toBeGreaterThan(0);
  });

  test("applies tiers, modes and the cache semantics flag", async () => {
    const t = await syncedCatalog();
    const tiered = await t.query(api.models.estimate, {
      provider: "openai",
      model: "gpt-5.4",
      usage: { inputTokens: 272_001 },
    });
    expect(tiered).toMatchObject({ known: true, tier: 272_000 });
    const fast = await t.query(api.models.estimate, {
      provider: "openai",
      model: "gpt-5.4",
      usage: { inputTokens: 1000, outputTokens: 1000 },
      mode: "fast",
    });
    expect(fast).toMatchObject({ known: true, nanoUsd: 35_000_000, mode: "fast" });
    const raw = await t.query(api.models.estimate, {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      usage: { inputTokens: 2000, cacheReadTokens: 6000, cacheWriteTokens: 2000 },
      inputIncludesCache: false,
    });
    expect(raw).toMatchObject({ known: true, nanoUsd: 6_000_000 + 1_800_000 + 7_500_000 });
  });

  test("unknown model or missing price is unknown, not zero", async () => {
    const t = await syncedCatalog();
    expect(
      await t.query(api.models.estimate, {
        provider: "openai",
        model: "nope",
        usage: { inputTokens: 1 },
      }),
    ).toEqual({ known: false });
    expect(
      await t.query(api.models.estimate, {
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
    // A newer model lands inside the first page's range.
    await t.run((ctx) =>
      ctx.db.insert("models", {
        ...fixtureModel("openai", "gpt-5.4"),
        modelId: "newest",
        releaseDate: "2099-01-01",
        contentHash: "h",
        firstSeenAt: 0,
        updatedAt: 0,
      }),
    );
    const reread = await t.query(api.models.list, {
      paginationOpts: { numItems: 3, cursor: null, endCursor: first.continueCursor },
    });
    expect(reread.continueCursor).toBe(first.continueCursor);
    expect(ids(reread.page)).toEqual(["openai/newest", ...ids(first.page)]);
    const following = await t.query(api.models.list, {
      paginationOpts: { numItems: 3, cursor: reread.continueCursor },
    });
    expect(ids(following.page)).toEqual(ids(next.page));
  });

  test("maximumRowsRead is clamped, and batches never read past the allowance", async () => {
    const t = await syncedCatalog();
    const none = { reasoning: true, toolCall: false, openWeights: true, providerId: "azure" };
    const small = await t.query(api.models.list, {
      ...none,
      paginationOpts: { numItems: 10, cursor: null, maximumRowsRead: 2 },
    });
    expect(small.page).toEqual([]);
    expect(small.isDone).toBe(false);
    const rest = await t.query(api.models.list, {
      ...none,
      paginationOpts: { numItems: 10, cursor: small.continueCursor, maximumRowsRead: 1_000_000 },
    });
    expect(rest.isDone).toBe(true);
  });

  test("a huge maximumRowsRead stops at 4,000 rows", async () => {
    const t = componentTest();
    const base = fixtureModel("openai", "gpt-5.4");
    await t.run(async (ctx) => {
      for (let i = 0; i < 4100; i++) {
        await ctx.db.insert("models", {
          ...base,
          modelId: `m-${i}`,
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
