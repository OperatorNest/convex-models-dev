import { register } from "@operatornest/convex-models-dev/test";
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { catalogServer } from "../../src/test-helpers.js";
import { fixtureJson, FIXTURE_MODEL_COUNT } from "../../src/fixtures/index.js";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}

test("queries are empty and report never_synced before the first sync", async () => {
  const t = setup();
  expect(await t.query(api.example.syncStatus, {})).toMatchObject({
    state: "never_synced",
    running: false,
    modelCount: 0,
  });
  expect(await t.query(api.example.getModel, { key: "openai/gpt-5.4" })).toBeNull();
  expect(await t.query(api.example.cheapestWithTools, {})).toEqual([]);
});

test("app syncs through the client and reads the catalog", async () => {
  const t = setup();
  const server = catalogServer({ body: fixtureJson() });
  await t.mutation(api.example.configureSync, { minProviders: 1, minModels: 1 });

  const synced = await t.action(api.example.syncNow, { force: true });
  expect(synced).toMatchObject({ status: "ok", modelCount: FIXTURE_MODEL_COUNT });
  expect(server.calls).toHaveLength(1);
  expect(await t.query(api.example.syncStatus, {})).toMatchObject({
    state: "ok",
    running: false,
    modelCount: FIXTURE_MODEL_COUNT,
  });

  expect(await t.query(api.example.getModel, { key: "anthropic/claude-sonnet-4-5" })).toMatchObject(
    {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      costInput: 3,
      costOutput: 15,
    },
  );
  const cheap = await t.query(api.example.cheapestWithTools, { minContext: 1_000_000 });
  expect(cheap.length).toBeGreaterThan(0);
  expect(cheap.every((m) => m.contextLimit >= 1_000_000)).toBe(true);

  expect(await t.action(api.example.syncNow, { force: true })).toMatchObject({
    status: "not_modified",
  });
});

test("agent usage is mapped and priced in nano-USD", async () => {
  const t = setup();
  catalogServer({ body: fixtureJson() });
  await t.mutation(api.example.configureSync, { minProviders: 1, minModels: 1 });
  await t.action(api.example.syncNow, { force: true });

  const nano = await t.query(api.example.costOfUsage, {
    provider: "anthropic.messages",
    model: "claude-sonnet-4-5",
    rawUsage: { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 0 },
  });
  expect(nano).toBe(10_500_000);
  expect(
    await t.query(api.example.costOfUsage, {
      provider: "openai",
      model: "gpt-image-1-mini",
      rawUsage: { inputTokens: 1 },
    }),
  ).toBeNull();
});
