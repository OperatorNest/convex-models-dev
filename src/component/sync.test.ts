import { afterEach, expect, test, vi, beforeEach, describe } from "vitest";
import { api, internal } from "./_generated/api.js";
import {
  catalogServer,
  drain,
  expectModelsDevError,
  setupTest,
  relaxGuards,
  required,
  stubFetch,
  type TestCtx,
} from "../test-helpers.js";
import {
  fixtureJson,
  fixtureModel,
  fixtureCatalog,
  rawModel,
  modelsOf,
  providerOf,
  FIXTURE_MODEL_COUNT,
  FIXTURE_PROVIDER_COUNT,
  type RawModel,
} from "../fixtures/index.js";
import { normalizeModel, normalizeProvider } from "../shared/normalize.js";

import { type FunctionArgs } from "convex/server";
import { USER_AGENT } from "./syncCore.js";

type T = TestCtx;
const setup = setupTest;

function fixtureModelInput() {
  const row = fixtureModel("openai", "gpt-5.4");
  return { ...row, contentHash: "h" };
}

const sync = (t: T, force = true) => t.action(force ? api.sync.runForced : api.sync.run, {});
const models = (t: T) => t.run((ctx) => ctx.db.query("models").take(2000));
const state = (t: T) => t.run((ctx) => ctx.db.query("syncState").first());
const changes = (t: T) => t.run((ctx) => ctx.db.query("priceChanges").take(2000));

const NOW = Date.UTC(2026, 9, 4, 12);
const LEASE_MS = 3 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("first sync, 200 then 304", () => {
  test("reports never_synced and serves nothing before the first sync", async () => {
    const t = setup();
    const status = await t.query(api.sync.getStatus, {});
    expect(status.state).toBe("never_synced");
    expect(status.running).toBe(false);
    expect(await t.query(api.providers.list, {})).toEqual([]);
    expect(
      await t.query(api.models.get, { modelsDevProviderId: "openai", modelsDevModelId: "gpt-5.4" }),
    ).toBeNull();
  });

  test("loads the catalog, stores the etag last and sends our User-Agent", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    const result = await sync(t);
    expect(result).toMatchObject({
      status: "ok",
      sourceUrl: "https://models.dev/api.json",
      providerCount: FIXTURE_PROVIDER_COUNT,
      modelCount: FIXTURE_MODEL_COUNT,
      added: FIXTURE_MODEL_COUNT,
      updated: 0,
      removed: 0,
      priceChanges: 0,
      skippedModels: 0,
    });
    expect(server.calls).toHaveLength(1);
    expect(new Headers(server.calls[0]?.init.headers).get("user-agent")).toBe(USER_AGENT);
    expect(new Headers(server.calls[0]?.init.headers).get("if-none-match")).toBeNull();

    expect(await models(t)).toHaveLength(FIXTURE_MODEL_COUNT);
    expect(await t.query(api.providers.list, {})).toHaveLength(FIXTURE_PROVIDER_COUNT);
    const row = await state(t);
    expect(row).toMatchObject({ etag: '"etag-1"', lastStatus: "ok", running: false });
    expect(row?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await changes(t)).toHaveLength(0);
    const status = await t.query(api.sync.getStatus, {});
    expect(status).toMatchObject({
      state: "ok",
      modelCount: FIXTURE_MODEL_COUNT,
      lastStatus: "ok",
    });
  });

  test("stores duplicate model ids under each provider", async () => {
    const t = setup();
    await relaxGuards(t);
    catalogServer({ body: fixtureJson() });
    await sync(t);
    const rows = await models(t);
    const gpt54 = rows
      .filter((m) => m.modelsDevModelId === "gpt-5.4")
      .map((m) => m.modelsDevProviderId)
      .toSorted();
    expect(gpt54).toEqual(["azure", "openai"]);
  });

  test("a second run replays the etag and short-circuits on 304", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    const before = await models(t);
    const second = await sync(t);
    expect(second).toMatchObject({ status: "not_modified" });
    expect(new Headers(server.calls[1]?.init.headers).get("if-none-match")).toBe('"etag-1"');
    expect(await models(t)).toEqual(before);
    expect(await state(t)).toMatchObject({ lastStatus: "not_modified" });
    expect((await state(t))?.errors).toEqual([]);
    expect((await t.query(api.sync.getStatus, {})).state).toBe("ok");
  });

  test("respects the minimum interval unless forced", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t, false);
    expect(await sync(t, false)).toEqual({ status: "skipped", reason: "min_interval", errors: [] });
    expect(server.calls).toHaveLength(1);
    expect((await sync(t, true)).status).toBe("not_modified");
    expect(server.calls).toHaveLength(2);
  });
});

describe("content hash and change detection", () => {
  test("same bytes with a new etag only update the etag", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    const before = await models(t);
    server.etag = '"etag-2"';
    const result = await sync(t);
    expect(result.status).toBe("not_modified");
    expect((await state(t))?.etag).toBe('"etag-2"');
    expect(await models(t)).toEqual(before);
  });

  test("changed bytes with identical rows touch no model rows", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    const before = await models(t);

    server.body = JSON.stringify(JSON.parse(server.body), null, 1);
    server.etag = '"etag-2"';
    const result = await sync(t);
    expect(result).toMatchObject({
      status: "ok",
      added: 0,
      updated: 0,
      removed: 0,
      priceChanges: 0,
    });
    expect(await models(t)).toEqual(before);
  });

  test("a changed price patches one row and records a priceChanges entry", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      rawModel(c, "anthropic", "claude-sonnet-4-5").cost = {
        input: 2.5,
        output: 15,
        cache_read: 0.3,
        cache_write: 3.75,
      };
    });
    server.etag = '"etag-2"';
    const result = await sync(t);
    expect(result).toMatchObject({
      status: "ok",
      added: 0,
      updated: 1,
      removed: 0,
      priceChanges: 1,
    });
    const history = await t.query(api.models.listPriceChanges, {
      modelsDevProviderId: "anthropic",
      modelsDevModelId: "claude-sonnet-4-5",
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      kind: "price",
      before: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      after: { input: 2.5, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    });
    const row = await t.query(api.models.get, {
      modelsDevProviderId: "anthropic",
      modelsDevModelId: "claude-sonnet-4-5",
    });
    expect(row?.costInput).toBe(2.5);
    expect(row?.costBlended).toBe((3 * 2.5 + 15) / 4);
  });

  test("a tier-only change is recorded as kind tiers", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      Object.assign(rawModel(c, "google", "gemini-2.5-pro").cost ?? {}, {
        tiers: [
          { input: 3, output: 15, cache_read: 0.25, tier: { type: "context", size: 200000 } },
        ],
      });
    });
    server.etag = '"etag-2"';
    await sync(t);
    const history = await t.query(api.models.listPriceChanges, {
      modelsDevProviderId: "google",
      modelsDevModelId: "gemini-2.5-pro",
    });
    expect(history.map((h) => h.kind)).toEqual(["tiers"]);
  });

  test("a non-price change updates the row without a priceChanges entry", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      rawModel(c, "openai", "gpt-5.4").name = "GPT-5.4 Renamed";
    });
    server.etag = '"etag-2"';
    const result = await sync(t);
    expect(result).toMatchObject({ updated: 1, priceChanges: 0 });
    expect(
      (
        await t.query(api.models.get, {
          modelsDevProviderId: "openai",
          modelsDevModelId: "gpt-5.4",
        })
      )?.name,
    ).toBe("GPT-5.4 Renamed");
  });

  test("new models are recorded as added after the first sync", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      modelsOf(c, "openai")["gpt-new"] = {
        ...rawModel(c, "openai", "gpt-5-mini"),
        id: "gpt-new",
        name: "GPT New",
      };
    });
    server.etag = '"etag-2"';
    const result = await sync(t);
    expect(result).toMatchObject({ added: 1, priceChanges: 1 });
    const history = await t.query(api.models.listPriceChanges, {
      modelsDevProviderId: "openai",
      modelsDevModelId: "gpt-new",
    });
    expect(history[0]).toMatchObject({ kind: "added", after: { input: 0.25, output: 2 } });
  });
});

describe("removal guard", () => {
  test("removes models that disappeared when under 20% of rows", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      delete modelsOf(c, "openai")["gpt-3.5-turbo"];
    });
    server.etag = '"etag-2"';
    const forced = await sync(t, true);
    expect(forced).toMatchObject({ removed: 1 });
    expect(forced).not.toHaveProperty("partialReason");
    expect(await models(t)).toHaveLength(FIXTURE_MODEL_COUNT - 1);
    const history = await t.query(api.models.listPriceChanges, {
      modelsDevProviderId: "openai",
      modelsDevModelId: "gpt-3.5-turbo",
    });
    expect(history[0]).toMatchObject({ kind: "removed" });
  });

  test("skips deletion when more than 20% would go, unless forced", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      delete c.azure;
      delete c.deepseek;
      delete modelsOf(c, "openai")["gpt-4o"];
    });
    server.etag = '"etag-2"';

    await t.run(async (ctx) => {
      const row = await ctx.db.query("syncState").first();
      await ctx.db.patch("syncState", required(row, "sync state")._id, { lastCheckedAt: 1 });
    });
    const result = await sync(t, false);
    const loadedModelCount = FIXTURE_MODEL_COUNT - 8;
    expect(result).toMatchObject({
      status: "partial",
      partialReason: "removal",
      removed: 0,
      modelCount: loadedModelCount,
    });
    expect(await models(t)).toHaveLength(FIXTURE_MODEL_COUNT);
    expect(await t.query(api.providers.list, {})).toHaveLength(FIXTURE_PROVIDER_COUNT);

    expect(await state(t)).toMatchObject({
      partialReason: "removal",
      lastStatus: "partial",
      lastSyncedAt: NOW,
      modelCount: loadedModelCount,
      providerCount: FIXTURE_PROVIDER_COUNT - 2,
    });
    expect(await state(t)).not.toHaveProperty("etag");
    expect(await t.query(api.sync.getStatus, {})).toMatchObject({
      state: "ok",
      lastStatus: "partial",
      partialReason: "removal",
      lastSyncedAt: NOW,
      modelCount: loadedModelCount,
      running: false,
    });

    const forced = await sync(t, true);
    expect(forced).toMatchObject({ status: "ok" });
    expect(forced).not.toHaveProperty("partialReason");
    expect(await state(t)).not.toHaveProperty("partialReason");
    expect(forced.removed).toBeGreaterThan(0);
    expect((await models(t)).some((m) => m.modelsDevProviderId === "azure")).toBe(false);
    expect(
      (await t.query(api.providers.list, {})).map((p) => p.modelsDevProviderId).toSorted(),
    ).toEqual(["anthropic", "deepinfra", "google", "novita-ai", "nvidia", "openai"]);
  });

  test("a model that fails validation is skipped but its stored row is kept", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      rawModel(c, "openai", "gpt-5.4").cost = { input: "free", output: 1 };
    });
    server.etag = '"etag-2"';
    const result = await sync(t);
    expect(result).toMatchObject({ status: "ok", skippedModels: 1, removed: 0 });
    expect(
      (
        await t.query(api.models.get, {
          modelsDevProviderId: "openai",
          modelsDevModelId: "gpt-5.4",
        })
      )?.costInput,
    ).toBe(2.5);
  });
});

describe("count guard", () => {
  test("aborts when the payload is smaller than the default 50 providers / 1,000 models", async () => {
    const t = setup();
    const server = catalogServer({ body: fixtureJson() });
    const result = await sync(t);
    expect(result.status).toBe("error");
    expect(result.errors.at(-1)?.code).toBe("MODELS_DEV_CATALOG_TOO_SMALL");
    expect(await models(t)).toHaveLength(0);
    expect(await state(t)).toMatchObject({ lastStatus: "error", running: false });
    expect(await state(t)).not.toHaveProperty("etag");
    expect((await t.query(api.sync.getStatus, {})).state).toBe("error");

    expect(server.calls.map((c) => new URL(c.url).host)).toEqual([
      "models.dev",
      "models.opencode.ai",
    ]);
  });

  test("aborts on too few models even with enough providers", async () => {
    const t = setup();
    await t.mutation(api.config.update, { minProviders: 1, minModels: FIXTURE_MODEL_COUNT + 1 });
    catalogServer({ body: fixtureJson() });
    expect((await sync(t)).status).toBe("error");
    expect(await models(t)).toHaveLength(0);
  });

  test("a bad second payload leaves data and etag untouched", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    const before = await models(t);
    server.body = "{ not json";
    server.etag = '"etag-2"';
    const result = await sync(t);
    expect(result.status).toBe("error");
    expect((await state(t))?.etag).toBe('"etag-1"');
    expect(await models(t)).toEqual(before);
    expect((await t.query(api.sync.getStatus, {})).state).toBe("error");
  });

  test("a malformed provider is skipped and never deletes its stored rows", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    const before = await models(t);
    for (const broken of [
      { id: "openai", name: "OpenAI" },
      { id: "openai", models: "none" },
      null,
    ]) {
      server.body = fixtureJson((c) => {
        Object.assign(c, { openai: broken });
      });
      server.etag = `"etag-${JSON.stringify(broken)}"`;
      const result = await sync(t);
      expect(result).toMatchObject({ status: "ok" });
      expect(await models(t)).toHaveLength(before.length);
    }
    expect(await state(t)).toMatchObject({ lastStatus: "ok", running: false });
  });

  test("rejects a payload that is not a provider map", async () => {
    const t = setup();
    await relaxGuards(t);
    catalogServer({ body: "[1,2,3]" });
    expect((await sync(t)).status).toBe("error");
  });
});

describe("source fallback", () => {
  test("uses the fallback host when the primary fails", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    server.failPrimary = true;
    const result = await sync(t);
    expect(result).toMatchObject({
      status: "ok",
      sourceUrl: "https://models.opencode.ai/api.json",
    });
    expect(server.calls.map((c) => new URL(c.url).host)).toEqual([
      "models.dev",
      "models.opencode.ai",
    ]);
    expect((await state(t))?.sourceUrl).toBe("https://models.opencode.ai/api.json");
  });

  test("reports an error when every source fails and keeps old data", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.failAll = true;
    const result = await sync(t);
    expect(result.status).toBe("error");
    expect(result.errors.at(-1)).toMatchObject({
      code: "MODELS_DEV_PROVIDER_ERROR",
      providerStatus: 503,
    });
    expect(await models(t)).toHaveLength(FIXTURE_MODEL_COUNT);
  });

  test("a configured source URL is used first and does not reuse another source's etag", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    await t.mutation(api.config.update, { sourceUrl: "https://mirror.example.com/api.json" });
    server.etag = '"etag-2"';
    await sync(t);
    expect(server.calls[1]?.url).toBe("https://mirror.example.com/api.json");
    expect(new Headers(server.calls[1]?.init.headers).get("if-none-match")).toBeNull();
  });

  test("each source failure is recorded once, and only fetch failures are network errors", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    server.failPrimary = true;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let digests = 0;
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
      digests++;
      if (digests > 1) throw new Error("digest unavailable");
      return digest(algorithm, data);
    });
    const applyFailed = await sync(t);
    expect(applyFailed.errors).toEqual([
      expect.objectContaining({ source: "primary", code: "MODELS_DEV_PROVIDER_ERROR" }),
      expect.objectContaining({ source: "fallback", code: "MODELS_DEV_SYNC_FAILED" }),
    ]);
    expect((await t.query(api.sync.getStatus, {})).errors).toEqual(applyFailed.errors);
    server.failPrimary = false;
    digests = 1;
    const loadFailed = await sync(t);
    expect(loadFailed.errors.map(({ source, code }) => [source, code])).toEqual([
      ["primary", "MODELS_DEV_SYNC_FAILED"],
      ["fallback", "MODELS_DEV_SYNC_FAILED"],
    ]);
    expect(loadFailed.errors.every((entry) => entry.retryable === undefined)).toBe(true);
  });

  test("a network exception is classified as an error, not thrown", async () => {
    const t = setup();
    await relaxGuards(t);
    stubFetch(() => {
      throw new TypeError("network down");
    });
    const result = await sync(t);
    expect(result.status).toBe("error");
    expect(result.errors.map(({ code, retryable }) => [code, retryable])).toEqual([
      ["MODELS_DEV_NETWORK_ERROR", true],
      ["MODELS_DEV_NETWORK_ERROR", true],
    ]);
  });

  test("a body read failure is a network error", async () => {
    const t = setup();
    await relaxGuards(t);
    stubFetch(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.error(new TypeError("connection reset"));
            },
          }),
        ),
    );
    const result = await sync(t);
    expect(result.errors.map(({ code }) => code)).toEqual([
      "MODELS_DEV_NETWORK_ERROR",
      "MODELS_DEV_NETWORK_ERROR",
    ]);
  });

  test("a redirect is an invalid response and is never followed", async () => {
    const t = setup();
    await relaxGuards(t);
    const calls = stubFetch(
      () =>
        new Response(null, { status: 301, headers: { location: "https://example.com/api.json" } }),
    );
    const result = await sync(t);
    expect(result.errors.map(({ code }) => code)).toEqual([
      "MODELS_DEV_INVALID_RESPONSE",
      "MODELS_DEV_INVALID_RESPONSE",
    ]);
    expect(calls.map(({ init }) => init.redirect)).toEqual(["manual", "manual"]);
  });

  test("a body that is not well-formed UTF-8 is an invalid response", async () => {
    const t = setup();
    await relaxGuards(t);
    stubFetch(() => new Response(new Uint8Array([0x7b, 0xff, 0x7d])));
    const result = await sync(t);
    expect(result.errors.map(({ code }) => code)).toEqual([
      "MODELS_DEV_INVALID_RESPONSE",
      "MODELS_DEV_INVALID_RESPONSE",
    ]);
  });
});

describe("lease", () => {
  test("a second begin while a lease is live is refused; an expired lease is taken over", async () => {
    const t = setup();
    const first = await t.mutation(internal.sync.begin, { runId: "a", force: true, cron: false });
    expect(first.proceed).toBe(true);
    expect(await t.mutation(internal.sync.begin, { runId: "b", force: true, cron: false })).toEqual(
      {
        proceed: false,
        reason: "already_running",
      },
    );
    const live = await t.query(api.sync.getStatus, {});
    expect(live.running).toBe(true);
    expect(live.leaseExpiresAt).toBe(NOW + LEASE_MS);
    vi.setSystemTime(NOW + LEASE_MS + 1);

    expect(await t.query(api.sync.getStatus, {})).toMatchObject({
      running: true,
      leaseExpiresAt: NOW + LEASE_MS,
    });
    expect(
      (await t.mutation(internal.sync.begin, { runId: "c", force: true, cron: false })).proceed,
    ).toBe(true);
  });

  test("a run that lost its lease cannot write results", async () => {
    const t = setup();
    await t.mutation(internal.sync.begin, { runId: "a", force: true, cron: false });
    vi.setSystemTime(NOW + LEASE_MS + 1);
    await t.mutation(internal.sync.begin, { runId: "b", force: true, cron: false });
    const stale = await t.mutation(internal.sync.finish, {
      runId: "a",
      status: "ok",
      durationMs: 1,
      etag: "x",
    });
    expect(stale).toBe(false);
    expect((await state(t))?.etag).toBeUndefined();
    expect(
      await t.mutation(internal.sync.finish, {
        runId: "b",
        status: "error",
        errors: [
          {
            source: "primary",
            code: "MODELS_DEV_SYNC_FAILED",
            message: "The catalog sync failed.",
          },
        ],
        durationMs: 1,
      }),
    ).toBe(true);
  });

  test("a run whose lease was taken over reports lease_lost, not ok or not_modified", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        vi.setSystemTime(NOW + LEASE_MS + 1);
        await t.mutation(internal.sync.begin, { runId: "thief", force: true, cron: false });
        return original(input, init);
      }),
    );
    server.etag = '"etag-2"';
    const result = await sync(t);
    expect(result).toMatchObject({ status: "error", errors: [{ code: "MODELS_DEV_LEASE_LOST" }] });
    expect(await state(t)).toMatchObject({ runId: "thief", running: true });
  });

  test("a failed run releases the lease", async () => {
    const t = setup();
    catalogServer({ body: fixtureJson() }).failAll = true;
    await sync(t);
    expect(await state(t)).toMatchObject({ running: false });
    expect((await t.query(api.sync.getStatus, {})).running).toBe(false);
  });

  test("a failed run whose lease was taken over reports lease_lost and leaves the new lease", async () => {
    const t = setup();
    stubFetch(async () => {
      vi.setSystemTime(NOW + LEASE_MS + 1);
      await t.mutation(internal.sync.begin, { runId: "thief", force: true, cron: false });
      return new Response("down", { status: 503 });
    });
    const result = await sync(t);
    expect(result).toMatchObject({
      status: "error",
      errors: [
        { source: "primary", code: "MODELS_DEV_PROVIDER_ERROR" },
        { source: "fallback", code: "MODELS_DEV_PROVIDER_ERROR" },
        { source: "fallback", code: "MODELS_DEV_LEASE_LOST" },
      ],
    });
    expect(result.errors).toHaveLength(3);
    expect(await state(t)).toMatchObject({ runId: "thief", running: true });
  });
});

describe("lease fencing", () => {
  test("a takeover mid-run turns the old run's writes into no-ops", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    const original = globalThis.fetch;
    let takenOver = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!takenOver) {
          takenOver = true;
          vi.setSystemTime(NOW + LEASE_MS + 1);
          await t.mutation(internal.sync.begin, { runId: "thief", force: true, cron: false });
        }
        return original(input, init);
      }),
    );
    const result = await sync(t);
    expect(result).toMatchObject({ status: "error", errors: [{ code: "MODELS_DEV_LEASE_LOST" }] });
    expect(await models(t)).toHaveLength(0);
    expect(await t.query(api.providers.list, {})).toHaveLength(0);
    expect(await state(t)).toMatchObject({ runId: "thief", running: true });
    expect(server.calls.length).toBeGreaterThan(0);
  });

  test("write mutations reject a foreign run id and renew a held lease", async () => {
    const t = setup();
    await t.mutation(internal.sync.begin, { runId: "a", force: true, cron: false });
    const row = { ...fixtureModelInput() };
    expect(
      await t.mutation(internal.sync.upsertModels, { runId: "b", rows: [row], recordAdded: false }),
    ).toMatchObject({ leaseLost: true, added: 0 });
    expect(await models(t)).toHaveLength(0);
    expect(await t.mutation(internal.sync.removeModels, { runId: "b", modelIds: [] })).toEqual({
      leaseLost: true,
      removed: 0,
    });
    expect(
      await t.mutation(internal.sync.removeProviders, { runId: "b", providerIds: [] }),
    ).toEqual({
      leaseLost: true,
    });
    vi.setSystemTime(NOW + LEASE_MS - 1000);
    expect(
      await t.mutation(internal.sync.upsertModels, { runId: "a", rows: [row], recordAdded: false }),
    ).toMatchObject({ leaseLost: false, added: 1 });
    expect((await state(t))?.leaseExpiresAt).toBe(NOW + 2 * LEASE_MS - 1000);
  });

  test("an expired lease that no run took over still accepts writes and the finish", async () => {
    const t = setup();
    await t.mutation(internal.sync.begin, { runId: "a", force: true, cron: false });
    vi.setSystemTime(NOW + 3 * LEASE_MS);
    expect(
      await t.mutation(internal.sync.upsertModels, {
        runId: "a",
        rows: [fixtureModelInput()],
        recordAdded: false,
      }),
    ).toMatchObject({ leaseLost: false, added: 1 });
    expect(
      await t.mutation(internal.sync.finish, {
        runId: "a",
        status: "ok",
        sourceUrl: "https://models.dev/api.json",
        contentHash: "late",
        durationMs: 1,
        stats: {
          added: 1,
          updated: 0,
          removed: 0,
          priceChanges: 0,
          skippedModels: 0,
          providerCount: 1,
          modelCount: 1,
        },
      }),
    ).toBe(true);
    expect(await state(t)).toMatchObject({ running: false, lastStatus: "ok", contentHash: "late" });
  });

  test("a run whose expired lease was taken over cannot finish", async () => {
    const t = setup();
    await t.mutation(internal.sync.begin, { runId: "a", force: true, cron: false });
    vi.setSystemTime(NOW + 3 * LEASE_MS);
    await t.mutation(internal.sync.begin, { runId: "c", force: true, cron: false });
    expect(
      await t.mutation(internal.sync.finish, {
        runId: "a",
        status: "error",
        errors: [
          {
            source: "primary",
            code: "MODELS_DEV_SYNC_FAILED",
            message: "The catalog sync failed.",
          },
        ],
        durationMs: 1,
      }),
    ).toBe(false);
    expect(await state(t)).toMatchObject({ runId: "c", running: true });
  });
});

describe("size guard on usable rows", () => {
  test("1,000 malformed models do not satisfy minModels", async () => {
    const t = setup();
    await t.mutation(api.config.update, { minProviders: 1, minModels: 1000 });
    const body = fixtureJson((c) => {
      const junk: Record<string, RawModel> = {};
      for (let i = 0; i < 1000; i++) junk[`bad-${i}`] = { name: `Bad ${i}` };
      providerOf(c, "openai").models = junk;
    });
    catalogServer({ body });
    const result = await sync(t);
    expect(result.status).toBe("error");
    expect(result.errors.at(-1)?.code).toBe("MODELS_DEV_CATALOG_TOO_SMALL");
    expect(await models(t)).toHaveLength(0);
  });
});

describe("mode price changes", () => {
  test("a changed mode price records a priceChanges row", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      rawModel(c, "openai", "gpt-5.4").experimental = {
        modes: { fast: { cost: { input: 6, output: 30, cache_read: 0.5 } } },
      };
    });
    server.etag = '"etag-2"';
    const result = await sync(t);
    expect(result).toMatchObject({ updated: 1, priceChanges: 1 });
    const history = await t.query(api.models.listPriceChanges, {
      modelsDevProviderId: "openai",
      modelsDevModelId: "gpt-5.4",
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      kind: "price",
      before: { modes: { fast: { cost: { input: 5 } } } },
      after: { modes: { fast: { cost: { input: 6 } } } },
    });
  });
});

describe("configure and tick", () => {
  test("rejects invalid settings with a coded ConvexError", async () => {
    const t = setup();
    const invalid = (args: FunctionArgs<typeof api.config.update>) =>
      t.mutation(api.config.update, args);
    await expectModelsDevError(invalid({ minIntervalMinutes: 5 }), "MODELS_DEV_INVALID_ARGUMENT");
    await expectModelsDevError(invalid({ retentionDays: 0 }), "MODELS_DEV_INVALID_ARGUMENT");
    await expectModelsDevError(invalid({ minModels: -1 }), "MODELS_DEV_INVALID_ARGUMENT");
    await expectModelsDevError(invalid({ minProviders: -1 }), "MODELS_DEV_INVALID_ARGUMENT");
    await expectModelsDevError(
      invalid({ sourceUrl: "http://example.com" }),
      "MODELS_DEV_INVALID_ARGUMENT",
    );
    await expectModelsDevError(
      invalid({ sourceUrl: "https://user:pw@example.com/api.json" }),
      "MODELS_DEV_INVALID_ARGUMENT",
    );
    await expectModelsDevError(
      invalid({ sourceUrl: "https://user@example.com/api.json" }),
      "MODELS_DEV_INVALID_ARGUMENT",
    );
    await expectModelsDevError(invalid({ sourceUrl: "nope" }), "MODELS_DEV_INVALID_ARGUMENT");
    await expectModelsDevError(invalid({ retentionDays: 0 }), "MODELS_DEV_INVALID_ARGUMENT");
    expect(await t.query(api.config.get, {})).toMatchObject({ minIntervalMinutes: 15 });
  });

  test("defaults and partial updates", async () => {
    const t = setup();
    expect(await t.query(api.config.get, {})).toEqual({
      enabled: true,
      sourceUrl: "https://models.dev/api.json",
      minIntervalMinutes: 15,
      retentionDays: 365,
      minProviders: 50,
      minModels: 1000,
    });
    await t.mutation(api.config.update, { enabled: false });
    const next = await t.mutation(api.config.update, { minIntervalMinutes: 60 });
    expect(next).toMatchObject({ enabled: false, minIntervalMinutes: 60 });
  });

  test("tick does nothing when disabled", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await t.mutation(api.config.update, { enabled: false });
    await t.action(internal.sync.tick, {});
    expect(server.calls).toHaveLength(0);
    expect((await sync(t)).status).toBe("ok");
  });

  test("tick syncs, then honours the interval floor", async () => {
    const t = setup();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await t.action(internal.sync.tick, {});
    expect(await models(t)).toHaveLength(FIXTURE_MODEL_COUNT);
    await t.action(internal.sync.tick, {});
    expect(server.calls).toHaveLength(1);
  });

  test("sync.run and tick record a failed sync instead of rethrowing", async () => {
    const t = setup();
    await relaxGuards(t);
    catalogServer({ body: fixtureJson() }).failAll = true;
    const result = await sync(t, false);
    expect(result).toMatchObject({
      status: "error",
      errors: [
        { source: "primary", code: "MODELS_DEV_PROVIDER_ERROR", retryable: true },
        { source: "fallback", code: "MODELS_DEV_PROVIDER_ERROR", retryable: true },
      ],
    });
    expect(await t.query(api.sync.getStatus, {})).toMatchObject({
      state: "error",
      running: false,
      errors: result.errors,
    });
    vi.setSystemTime(NOW + 60 * 60_000);
    await expect(t.action(internal.sync.tick, {})).resolves.toBeNull();
    const afterTick = await t.query(api.sync.getStatus, {});
    expect(afterTick).toMatchObject({ state: "error", running: false });
    expect(afterTick.lastCheckedAt).toBe(NOW + 60 * 60_000);
  });

  test("cleanup deletes price history older than the retention window in self-scheduled batches", async () => {
    const t = setup();
    catalogServer({ body: fixtureJson() }).failAll = true;
    await t.mutation(api.config.update, { retentionDays: 30 });
    const day = 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      for (let i = 0; i < 520; i++) {
        await ctx.db.insert("priceChanges", {
          modelsDevProviderId: "p",
          modelsDevModelId: "m",
          changedAt: Date.now() - 40 * day,
          kind: "price",
        });
      }
      await ctx.db.insert("priceChanges", {
        modelsDevProviderId: "p",
        modelsDevModelId: "m",
        changedAt: Date.now() - day,
        kind: "price",
      });
    });
    await t.action(internal.sync.tick, {});
    expect(await changes(t)).toHaveLength(521);
    await t.mutation(internal.cleanup.run, {});
    expect(await changes(t)).toHaveLength(21);
    await drain(t);
    const left = await changes(t);
    expect(left).toHaveLength(1);
    expect(left[0]?.changedAt).toBeGreaterThan(Date.now() - 2 * day);
  });
});

describe("chunking", () => {
  test("syncs a catalog larger than one chunk", async () => {
    const t = setup();
    await t.mutation(api.config.update, { minProviders: 1, minModels: 100 });
    const template = rawModel(fixtureCatalog, "openai", "gpt-5-mini");
    const body = fixtureJson((c) => {
      const big: Record<string, RawModel> = {};
      for (let i = 0; i < 650; i++)
        big[`m-${i}`] = { ...template, id: `m-${i}`, name: `Model ${i}` };
      providerOf(c, "openai").models = big;
    });
    catalogServer({ body });
    const result = await sync(t);
    expect(result).toMatchObject({ status: "ok", added: 650 + FIXTURE_MODEL_COUNT - 6 });
    expect(await models(t)).toHaveLength(650 + FIXTURE_MODEL_COUNT - 6);
  });
});

test("new models do not dilute the removal guard", async () => {
  const t = setupTest();
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
    const row = required(await ctx.db.query("syncState").first(), "sync state");
    await ctx.db.patch("syncState", row._id, { lastCheckedAt: 1 });
  });
  expect(await sync(t, false)).toMatchObject({
    status: "partial",
    removed: 0,
  });
  expect(
    await t.query(api.models.get, { modelsDevProviderId: "openai", modelsDevModelId: "gpt-5.4" }),
  ).not.toBeNull();
});

test("interrupted catalog writes invalidate both cache validators", async () => {
  const t = setupTest();
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
  const recordedState = required(
    await t.run((ctx) => ctx.db.query("syncState").first()),
    "sync state",
  );
  expect(recordedState.etag).toBeUndefined();
  expect(recordedState.contentHash).toBeUndefined();
  await t.run((ctx) => ctx.db.patch("syncState", recordedState._id, { leaseExpiresAt: 1 }));
  expect(await sync(t)).toMatchObject({ status: "ok" });
  expect(new Headers(server.calls.at(-1)?.init.headers).get("if-none-match")).toBeNull();
  expect(
    await t.query(api.models.get, { modelsDevProviderId: "openai", modelsDevModelId: "gpt-5.4" }),
  ).toMatchObject({ name: fixtureModel("openai", "gpt-5.4").name });
});

test.each([{ cost: "bad" }, { cost: [] }, { cost: 123 }])(
  "malformed cost preserves the stored price, case %#",
  async ({ cost }) => {
    const t = setupTest();
    await relaxGuards(t);
    const server = catalogServer({ body: fixtureJson() });
    await sync(t);
    server.body = fixtureJson((c) => {
      Object.assign(rawModel(c, "openai", "gpt-5.4"), { cost });
    });
    server.etag = '"new"';
    expect(await sync(t)).toMatchObject({ skippedModels: 1, updated: 0 });
    expect(
      await t.query(api.models.get, { modelsDevProviderId: "openai", modelsDevModelId: "gpt-5.4" }),
    ).toMatchObject({ costInput: 2.5 });
  },
);

test("downloads stop before buffering more than 8 MiB", async () => {
  const t = setupTest();
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
          if (sourceChunks === 20) controller.close();
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
    errors: [{ code: "MODELS_DEV_CATALOG_TOO_LARGE" }, { code: "MODELS_DEV_CATALOG_TOO_LARGE" }],
  });
  expect(cancelled).toBe(2);
  expect(chunks).toBeLessThan(2 * 20);
});

test("a completed source without an etag clears the previous source etag", async () => {
  const t = setupTest();
  await relaxGuards(t);
  catalogServer({ body: fixtureJson() });
  await sync(t);
  await t.mutation(internal.sync.begin, { runId: "new", force: true, cron: false });
  await t.mutation(internal.sync.finish, {
    runId: "new",
    status: "ok",
    sourceUrl: "https://mirror.example/api.json",
    contentHash: "new",
    durationMs: 0,
  });
  expect((await t.run((ctx) => ctx.db.query("syncState").first()))?.etag).toBeUndefined();
});

test("sync failures never persist upstream text or broken Unicode", async () => {
  const t = setupTest();
  await relaxGuards(t);
  catalogServer({ body: JSON.stringify({ ["x".repeat(499) + "😀secret_from_body"]: null }) });
  const result = await sync(t);
  expect(result).toMatchObject({
    status: "error",
    errors: [
      {
        code: "MODELS_DEV_CATALOG_TOO_SMALL",
        message: "The catalog has fewer usable providers or models than configured.",
      },
      {
        code: "MODELS_DEV_CATALOG_TOO_SMALL",
        message: "The catalog has fewer usable providers or models than configured.",
      },
    ],
  });
  const recordedState = await t.run((ctx) => ctx.db.query("syncState").first());
  expect(recordedState?.errors).toEqual(result.errors);
  expect(JSON.stringify(recordedState)).not.toContain("secret_from_body");
});

test("tuple identities cannot collide during removal", async () => {
  const t = setupTest();
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
  expect(
    await t.query(api.models.get, { modelsDevProviderId: "p\u0000q", modelsDevModelId: "m" }),
  ).toBeNull();
});

test("indexed UTF-8 strings are bounded and skipped rows survive", async () => {
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
  const t = setupTest();
  await relaxGuards(t);
  const server = catalogServer({ body: fixtureJson() });
  await sync(t);
  const before = await t.query(api.models.get, {
    modelsDevProviderId: "openai",
    modelsDevModelId: "gpt-5.4",
  });
  server.body = fixtureJson((c) => {
    rawModel(c, "openai", "gpt-5.4").family = oversized;
  });
  server.etag = '"oversized"';
  expect(await sync(t)).toMatchObject({ status: "ok", skippedModels: 1 });
  expect(
    await t.query(api.models.get, { modelsDevProviderId: "openai", modelsDevModelId: "gpt-5.4" }),
  ).toEqual(before);
});

test("losing more than 20 percent of stored prices writes no catalog rows", async () => {
  const t = setupTest();
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
    const row = required(await ctx.db.query("syncState").first(), "sync state");
    await ctx.db.patch("syncState", row._id, { lastCheckedAt: 1 });
  });
  expect(await sync(t, false)).toMatchObject({
    status: "partial",
    partialReason: "price_loss",
    updated: 0,
    added: 0,
    priceChanges: 0,
  });
  expect(await state(t)).toMatchObject({
    lastStatus: "partial",
    partialReason: "price_loss",
    modelCount: FIXTURE_MODEL_COUNT,
    updated: 0,
    added: 0,
  });
  expect(
    await t.run(async (ctx) => ({
      models: await ctx.db.query("models").take(100),
      providers: await ctx.db.query("providers").take(100),
      history: await ctx.db.query("priceChanges").take(100),
    })),
  ).toEqual(before);
  expect(await sync(t, true)).toMatchObject({ status: "ok", updated: FIXTURE_MODEL_COUNT - 3 });
});

test("failed sources remain ordered diagnostics including successful fallback", async () => {
  const t = setupTest();
  await relaxGuards(t);
  stubFetch((call) =>
    call.url.includes("models.dev")
      ? new Response("secret", { status: 502 })
      : new Response("bad json"),
  );
  const primary = {
    source: "primary",
    code: "MODELS_DEV_PROVIDER_ERROR",
    message: "The catalog provider returned a failure response.",
    providerStatus: 502,
  };
  const fallback = {
    source: "fallback",
    code: "MODELS_DEV_INVALID_RESPONSE",
    message: "The catalog response is malformed.",
  };
  expect(await sync(t)).toMatchObject({ status: "error", errors: [primary, fallback] });
  expect(await t.query(api.sync.getStatus, {})).toMatchObject({ errors: [primary, fallback] });
  stubFetch((call) =>
    call.url.includes("models.dev")
      ? new Response(null, { status: 502 })
      : new Response(fixtureJson()),
  );
  expect(await sync(t)).toMatchObject({ status: "ok", errors: [primary] });
  expect(await t.query(api.sync.getStatus, {})).toMatchObject({ errors: [primary] });
});

test("malformed providers preserve stored rows while healthy providers sync", async () => {
  const t = setupTest();
  await relaxGuards(t);
  const server = catalogServer({ body: fixtureJson() });
  await sync(t);
  const before = await t.query(api.models.get, {
    modelsDevProviderId: "openai",
    modelsDevModelId: "gpt-5.4",
  });
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
    expect(
      await t.query(api.models.get, { modelsDevProviderId: "openai", modelsDevModelId: "gpt-5.4" }),
    ).toEqual(before);
    expect(await t.query(api.providers.get, { modelsDevProviderId: "openai" })).not.toBeNull();
  }
  await t.mutation(api.config.update, { minProviders: FIXTURE_PROVIDER_COUNT });
  server.etag = '"floor"';
  server.body = server.body + " ";
  expect(await sync(t)).toMatchObject({
    status: "error",
    errors: [{ code: "MODELS_DEV_CATALOG_TOO_SMALL" }, { code: "MODELS_DEV_CATALOG_TOO_SMALL" }],
  });
});

test("price-loss guard permits exactly 20 percent and counts only stored priced models", async () => {
  const t = setupTest();
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
  for (const id of ["m-0", "m-1"]) delete required(degraded.p.models[id], `model ${id}`).cost;
  for (let i = 0; i < 20; i++) degraded.p.models[`new-${i}`] = { ...template };
  server.body = JSON.stringify(degraded);
  server.etag = '"twenty-percent"';
  await t.run(async (ctx) => {
    const row = required(await ctx.db.query("syncState").first(), "sync state");
    await ctx.db.patch("syncState", row._id, { lastCheckedAt: 1 });
  });
  expect(await sync(t, false)).toMatchObject({ status: "ok", updated: 2, added: 20 });
  expect(
    await t.query(api.models.get, { modelsDevProviderId: "p", modelsDevModelId: "m-0" }),
  ).toMatchObject({
    hasCost: false,
  });
});

function streamedResponse(body: string, chunkBytes: number, headers?: Record<string, string>) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset >= bytes.byteLength) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunkBytes));
        offset += chunkBytes;
      },
    }),
    { headers },
  );
}

test("a catalog streamed without content-length reads completely", async () => {
  const t = setupTest();
  await relaxGuards(t);
  const body = fixtureJson().padEnd(3 * 1024 * 1024 + 7, " ");
  stubFetch(() => streamedResponse(body, 64 * 1024));
  expect(await sync(t)).toMatchObject({ status: "ok", modelCount: FIXTURE_MODEL_COUNT });
});

test("a catalog with a leading byte order mark syncs", async () => {
  const t = setupTest();
  await relaxGuards(t);
  stubFetch(() => new Response(`\uFEFF${fixtureJson()}`));
  expect(await sync(t)).toMatchObject({ status: "ok", modelCount: FIXTURE_MODEL_COUNT });
});

test("a streamed catalog of exactly 8 MiB is read completely", async () => {
  const t = setupTest();
  await relaxGuards(t);
  const body = fixtureJson().padEnd(8 * 1024 * 1024, " ");
  stubFetch(() => streamedResponse(body, 1024 * 1024));
  expect(await sync(t)).toMatchObject({ status: "ok", modelCount: FIXTURE_MODEL_COUNT });
});

test("a content-length below the decoded body size still reads the whole catalog", async () => {
  const t = setupTest();
  await relaxGuards(t);
  const body = fixtureJson();
  stubFetch(() => streamedResponse(body, 4096, { "content-length": "100" }));
  expect(await sync(t)).toMatchObject({ status: "ok", modelCount: FIXTURE_MODEL_COUNT });
});

test("a content-length above 8 MiB is rejected before reading", async () => {
  const t = setupTest();
  await relaxGuards(t);
  let pulls = 0;
  stubFetch(
    () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulls++;
            controller.enqueue(new Uint8Array(1024));
          },
        }),
        { headers: { "content-length": String(8 * 1024 * 1024 + 1) } },
      ),
  );
  expect(await sync(t)).toMatchObject({
    status: "error",
    errors: [{ code: "MODELS_DEV_CATALOG_TOO_LARGE" }, { code: "MODELS_DEV_CATALOG_TOO_LARGE" }],
  });
  expect(pulls).toBeLessThanOrEqual(2);
});

test("a catalog at live size syncs every provider and model", { timeout: 120_000 }, async () => {
  const t = setupTest();
  const liveProviderCount = 228;
  const liveModelCount = 8773;
  const template = rawModel(fixtureCatalog, "openai", "gpt-5.4");
  const catalog: Record<string, { name: string; models: Record<string, RawModel> }> = {};
  for (let p = 0; p < liveProviderCount; p++) {
    const modelCount =
      Math.floor(liveModelCount / liveProviderCount) +
      (p < liveModelCount % liveProviderCount ? 1 : 0);
    catalog[`provider-${p}`] = {
      name: `Provider ${p}`,
      models: Object.fromEntries(
        Array.from({ length: modelCount }, (_, m) => [
          `model-${m}`,
          { ...template, id: `model-${m}`, name: `Model ${p}-${m}` },
        ]),
      ),
    };
  }
  const body = JSON.stringify(catalog);
  stubFetch(() => new Response(body, { headers: { "content-length": String(body.length) } }));
  expect(await sync(t)).toMatchObject({
    status: "ok",
    providerCount: liveProviderCount,
    modelCount: liveModelCount,
    added: liveModelCount,
  });
  expect(await t.run((ctx) => ctx.db.query("models").take(10_000))).toHaveLength(liveModelCount);
  expect(await t.run((ctx) => ctx.db.query("providers").take(1000))).toHaveLength(
    liveProviderCount,
  );
});

test("a provider row counts only its usable models", async () => {
  const t = setupTest();
  await relaxGuards(t);
  catalogServer({
    body: fixtureJson((c) => {
      rawModel(c, "anthropic", "claude-opus-4-5").cost = { input: "free", output: 1 };
    }),
  });
  expect(await sync(t)).toMatchObject({ status: "ok", skippedModels: 1 });
  expect(await t.query(api.providers.get, { modelsDevProviderId: "anthropic" })).toMatchObject({
    modelCount: Object.keys(modelsOf(fixtureCatalog, "anthropic")).length - 1,
  });
});
