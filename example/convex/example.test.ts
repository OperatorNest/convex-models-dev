import { register } from "@operatornest/convex-models-dev/test";
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { catalogServer } from "../../src/test-helpers.js";
import { fixtureJson, FIXTURE_MODEL_COUNT } from "../../src/fixtures/index.js";
import { api, internal } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t.withIdentity({ subject: "reader" });
}

test("queries are empty and report never_synced before the first sync", async () => {
  const t = setup();
  expect(await t.query(api.example.syncStatus, {})).toMatchObject({
    state: "never_synced",
    running: false,
    modelCount: 0,
  });
  expect(await t.query(api.example.getModel, { key: "openai/gpt-5.4" })).toBeNull();
  expect(await t.query(api.example.cheapestWithTools, {})).toEqual({
    models: [],
    isComplete: true,
  });
});

test("app syncs through the client and reads the catalog", async () => {
  const t = setup();
  const server = catalogServer({ body: fixtureJson() });
  await t.mutation(internal.example.configureSync, { minProviders: 1, minModels: 1 });

  const synced = await t.action(internal.example.syncForced, {});
  expect(synced).toMatchObject({ status: "ok", modelCount: FIXTURE_MODEL_COUNT });
  expect(server.calls).toHaveLength(1);
  expect(await t.query(api.example.syncStatus, {})).toMatchObject({
    state: "ok",
    running: false,
    modelCount: FIXTURE_MODEL_COUNT,
  });

  expect(await t.query(api.example.getModel, { key: "anthropic/claude-sonnet-4-5" })).toMatchObject(
    {
      modelsDevProviderId: "anthropic",
      modelsDevModelId: "claude-sonnet-4-5",
      costInput: 3,
      costOutput: 15,
    },
  );
  const cheap = await t.query(api.example.cheapestWithTools, { minContextTokens: 1_000_000 });
  expect(cheap.models.length).toBeGreaterThan(0);
  expect(cheap.models.every((m) => m.contextTokens >= 1_000_000)).toBe(true);

  expect(await t.action(internal.example.syncForced, {})).toMatchObject({
    status: "not_modified",
  });
});

test("agent usage is mapped and priced in nano-USD", async () => {
  const t = setup();
  catalogServer({ body: fixtureJson() });
  await t.mutation(internal.example.configureSync, { minProviders: 1, minModels: 1 });
  await t.action(internal.example.syncForced, {});

  const nano = await t.query(api.example.costOfUsage, {
    mode: null,
    inputTokenScope: "includesCache",
    provider: "anthropic.messages",
    model: "claude-sonnet-4-5",
    rawUsage: { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 0 },
  });
  expect(nano).toBe(10_500_000);
  expect(
    await t.query(api.example.costOfUsage, {
      mode: null,
      inputTokenScope: "includesCache",
      provider: "openai",
      model: "gpt-image-1-mini",
      rawUsage: { inputTokens: 1 },
    }),
  ).toBeNull();
});

test("maintenance functions are internal and public reads require authentication", async () => {
  const functions = await import("./example.js");
  expect(functions.syncNow).toHaveProperty("isInternal", true);
  expect(functions.configureSync).toHaveProperty("isInternal", true);
  await expect(convexTest(schema, modules).query(api.example.syncStatus, {})).rejects.toThrow(
    "Not signed in.",
  );
});
