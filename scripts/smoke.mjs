import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import ts from "typescript";
import { runSmoke, smokeEnv, step } from "./smoke-harness.mjs";

const root = resolve(import.meta.dirname, "..");
const SYNC_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;
const GENERATED_PROVIDER_COUNT = 50;
const GENERATED_MODELS_PER_PROVIDER = 20;
const LIVE_SOURCE_URLS = ["https://models.dev/api.json", "https://models.opencode.ai/api.json"];
const DEPLOYED_CONFIG_PATHS = ["src/component/config.ts", "dist/component/config.js"];

let checks = 0;

function check(condition, message) {
  if (!condition) throw new Error(message);
  checks++;
}

function errorCode(promise) {
  return promise.then(
    () => "accepted",
    (error) => /MODELS_DEV_[A-Z_]+/.exec(String(error.message))?.[0] ?? "unknown",
  );
}

function keyOf(row) {
  return JSON.stringify([row.modelsDevProviderId, row.modelsDevModelId]);
}

async function loadFixtureCatalog() {
  const source = readFileSync(join(root, "src/fixtures/api.fixture.ts"), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  const { fixtureCatalog } = await import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
  return structuredClone(fixtureCatalog);
}

function startCatalogServer(source) {
  const server = createServer((request, response) => {
    source.requests.push(request.url);
    if (source.isFailing) {
      response.writeHead(503);
      response.end("fixture failure");
      return;
    }
    if (request.headers["if-none-match"] === source.etag) {
      response.writeHead(304);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag: source.etag });
    response.end(source.body);
  });
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen(server));
  });
}

function pointConfigAtFixture(workspace, primaryUrl, fallbackUrl) {
  for (const relative of DEPLOYED_CONFIG_PATHS) {
    const path = join(workspace, relative);
    const original = readFileSync(path, "utf8");
    const patched = original
      .replace(LIVE_SOURCE_URLS[0], primaryUrl)
      .replace(LIVE_SOURCE_URLS[1], fallbackUrl);
    if (LIVE_SOURCE_URLS.some((url) => patched.includes(url) || !original.includes(url)))
      throw new Error(`${relative} does not hold exactly the expected live source URLs`);
    writeFileSync(path, patched);
  }
}

function writeTarballConsumer(workspace) {
  const consumer = join(workspace, "consumer");
  const installed = join(consumer, "node_modules/@operatornest/convex-models-dev");
  const archive = join(consumer, "package.tgz");
  mkdirSync(installed, { recursive: true });
  execFileSync("pnpm", ["pack", "--out", archive], { cwd: root, env: smokeEnv, stdio: "pipe" });
  execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", installed], {
    env: smokeEnv,
    stdio: "pipe",
  });
  for (const entry of readdirSync(join(root, "node_modules"))) {
    if (entry === "@operatornest") continue;
    symlinkSync(join(root, "node_modules", entry), join(consumer, "node_modules", entry), "dir");
  }
  cpSync(join(root, "example"), join(consumer, "example"), { recursive: true });
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "models-dev-smoke-consumer", private: true, type: "module" }),
  );
  writeFileSync(
    join(consumer, "consumer.ts"),
    `import { ModelsDev, estimateCost } from "@operatornest/convex-models-dev";
import { register } from "@operatornest/convex-models-dev/test";
import { components } from "./example/convex/_generated/api.js";
export const models = new ModelsDev(components.modelsDev);
export { estimateCost, register };
`,
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        target: "ESNext",
        lib: ["ES2024", "DOM"],
        module: "ESNext",
        moduleResolution: "Bundler",
        types: [],
      },
      include: ["consumer.ts", "example/convex/**/*.ts"],
      exclude: ["**/*.test.ts"],
    }),
  );
  writeFileSync(
    join(consumer, "vitest.config.mjs"),
    `import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["consumer.test.ts"],
    server: { deps: { inline: ["@operatornest/convex-models-dev"] } },
  },
});
`,
  );
  writeFileSync(
    join(consumer, "consumer.test.ts"),
    `import { register } from "@operatornest/convex-models-dev/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./example/convex/_generated/api.js";
import schema from "./example/convex/schema.js";
const modules = import.meta.glob(["./example/convex/**/*.ts", "!./example/convex/**/*.test.ts"]);
test("installed test entrypoint registers component queries", async () => {
  const t = convexTest(schema, modules);
  register(t);
  expect(await t.withIdentity({ subject: "reader" }).query(api.example.syncStatus, {}))
    .toMatchObject({ state: "never_synced", modelCount: 0 });
  await expect(t.query(api.example.syncStatus, {})).rejects.toThrow("Not signed in.");
});
`,
  );
}

const fixture = await loadFixtureCatalog();
const fixtureProviderCount = Object.keys(fixture).length;
const fixtureModelCount = Object.values(fixture).reduce(
  (sum, provider) => sum + Object.keys(provider.models).length,
  0,
);
const template = fixture.openai.models["gpt-5-mini"];
for (let providerIndex = 0; providerIndex < GENERATED_PROVIDER_COUNT; providerIndex++)
  fixture[`fixture-${providerIndex}`] = {
    name: `Fixture ${providerIndex}`,
    models: Object.fromEntries(
      Array.from({ length: GENERATED_MODELS_PER_PROVIDER }, (_, modelIndex) => [
        `model-${modelIndex}`,
        { ...template, name: `Fixture model ${modelIndex}` },
      ]),
    ),
  };
const source = {
  body: JSON.stringify(fixture),
  etag: '"fixture-1"',
  isFailing: false,
  requests: [],
};
const server = await startCatalogServer(source);
const origin = `http://127.0.0.1:${server.address().port}`;
const primaryUrl = `${origin}/primary`;
const fallbackUrl = `${origin}/fallback`;

async function journey(backend) {
  const client = new ConvexHttpClient(backend.url, { logger: false });
  client.setAdminAuth(backend.adminKey, {
    subject: "smoke",
    issuer: "local",
    tokenIdentifier: "local|smoke",
  });
  const publicClient = new ConvexHttpClient(backend.url, { logger: false });
  const query = (name, args = {}) => client.query(anyApi.example[name], args);
  const action = (name, args = {}) => client.action(anyApi.example[name], args);
  const component = (name, args) => backend.runFunction(name, args, { component: "modelsDev" });

  await step(
    "packed tarball passes a strict consumer typecheck and its test entrypoint runs",
    () => {
      const consumer = join(backend.workspace, "consumer");
      execFileSync(
        process.execPath,
        [join(root, "node_modules/@typescript/native/bin/tsc"), "--noEmit"],
        { cwd: consumer, env: smokeEnv, stdio: "pipe" },
      );
      check(true, "strict tarball consumer typecheck failed");
      execFileSync(process.execPath, [join(root, "node_modules/vitest/vitest.mjs"), "run"], {
        cwd: consumer,
        env: smokeEnv,
        stdio: "pipe",
      });
      check(true, "tarball consumer test failed");
    },
  );

  await step("first cron sync reads only the local fixture server", async () => {
    const deadline = Date.now() + SYNC_TIMEOUT_MS;
    let status = await query("syncStatus");
    while (status.running || status.lastCheckedAt === undefined) {
      if (Date.now() > deadline) throw new Error("first cron sync did not finish");
      await sleep(POLL_INTERVAL_MS);
      status = await query("syncStatus");
    }
    check(
      source.requests[0] === "/primary",
      `first fixture request ${JSON.stringify(source.requests[0])}`,
    );
    check(
      status.state === "ok" && status.sourceUrl === primaryUrl && status.errors.length === 0,
      `cron sync state ${status.state} from ${status.sourceUrl}`,
    );
  });

  await step("forced sync stores the fixture catalog and releases the lease", async () => {
    await client.mutation(anyApi.example.configureSync, { minProviders: 1, minModels: 1 });
    const synced = await action("syncForced");
    check(["ok", "not_modified"].includes(synced.status), `sync status ${synced.status}`);
    const status = await query("syncStatus");
    check(
      status.modelCount ===
        fixtureModelCount + GENERATED_PROVIDER_COUNT * GENERATED_MODELS_PER_PROVIDER &&
        status.providerCount === fixtureProviderCount + GENERATED_PROVIDER_COUNT &&
        status.sourceUrl === primaryUrl &&
        !status.running &&
        status.errors.length === 0,
      "sync counts, source URL or lease differ",
    );
  });

  await step("interval floor skips sync and an unchanged ETag is not modified", async () => {
    check((await action("syncNow")).reason === "min_interval", "interval floor failed");
    check((await action("syncForced")).status === "not_modified", "conditional fetch failed");
  });

  await step("pages do not overlap and model lookup reads stored prices", async () => {
    const first = await query("listModels", { paginationOpts: { cursor: null, numItems: 10 } });
    const next = await query("listModels", {
      paginationOpts: { cursor: first.continueCursor, numItems: 10 },
    });
    const firstKeys = new Set(first.page.map(keyOf));
    check(
      first.page.length === 10 &&
        next.page.length === 10 &&
        next.page.every((row) => !firstKeys.has(keyOf(row))),
      "pagination overlapped",
    );
    check(
      (await query("getModel", { key: "openai/gpt-5.4" })).costInput === 2.5,
      "model lookup failed",
    );
  });

  await step("type filter returns the embedding model with its limit object", async () => {
    const embedding = [];
    for (let cursor = null, isDone = false; !isDone;) {
      const result = await component("models:list", {
        type: "embedding",
        paginationOpts: { numItems: 100, cursor },
      });
      embedding.push(...result.page);
      cursor = result.continueCursor;
      isDone = result.isDone;
    }
    check(
      embedding.length === 1 &&
        embedding[0].modelsDevModelId === "qwen/qwen3-embedding-8b" &&
        embedding[0].limit.context === 32768 &&
        embedding[0].contextTokens === 32768,
      "type filter or limit object differs",
    );
  });

  await step("cost estimate prices usage and rejects unsafe token counts", async () => {
    check(
      (await query("costOfUsage", {
        mode: null,
        inputTokenScope: "includesCache",
        provider: "anthropic.messages",
        model: "claude-sonnet-4-5",
        rawUsage: { inputTokens: 1000, outputTokens: 500 },
      })) === 10_500_000,
      "cost differs",
    );
    check(
      (await errorCode(
        query("costOfUsage", {
          mode: null,
          inputTokenScope: "includesCache",
          provider: "openai",
          model: "gpt-5.4",
          rawUsage: { inputTokens: 1e308 },
        }),
      )) === "MODELS_DEV_INVALID_ARGUMENT",
      "unsafe usage accepted",
    );
    for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      check(
        (await errorCode(
          component("models:estimateCost", {
            mode: null,
            inputTokenScope: "includesCache",
            provider: "openai",
            model: "gpt-5.4",
            usage: { inputTokens: count },
          }),
        )) === "MODELS_DEV_INVALID_ARGUMENT",
        `token count ${count} accepted`,
      );
    check(
      (
        await component("models:estimateCost", {
          inputTokenScope: "includesCache",
          provider: "openai",
          model: "gpt-5.4",
          usage: { inputTokens: 10 },
          mode: "absent",
        })
      ).known === false,
      "unpriced mode accepted",
    );
  });

  await step("cheapest queries rank capability and provider ranges", async () => {
    check((await query("cheapestWithTools")).models.length > 0, "capability query empty");
    const providerIds = ["openai", "anthropic"];
    const cheapest = await component("models:listCheapest", {
      modelsDevProviderIds: providerIds,
      limit: 20,
    });
    check(
      cheapest.isComplete &&
        cheapest.models.length > 0 &&
        cheapest.models.every((row) => providerIds.includes(row.modelsDevProviderId)),
      "provider cost ranges differ",
    );
  });

  await step("page bounds reject malformed cursors and ignore caller read budgets", async () => {
    for (const cursor of ["not-json", "{}", "[{}]", `[${'"a",'.repeat(2048)}"a"]`])
      check(
        (await errorCode(component("models:list", { paginationOpts: { numItems: 1, cursor } }))) ===
          "MODELS_DEV_INVALID_ARGUMENT",
        `cursor ${cursor.slice(0, 16)} accepted`,
      );
    const pinned = await component("models:list", {
      includeDeprecated: true,
      paginationOpts: { numItems: 1, cursor: null, endCursor: "[]" },
    });
    check(
      pinned.pageStatus === "SplitRequired" &&
        typeof pinned.splitCursor === "string" &&
        pinned.page.length <= 2,
      "pinned split metadata missing",
    );
    const budgeted = await component("models:list", {
      includeDeprecated: true,
      paginationOpts: { numItems: 10, cursor: null, maximumRowsRead: 1, maximumBytesRead: 1 },
    });
    check(budgeted.page.length === 10, "caller read budget applied");
  });

  await step("config rejects insecure and oversized source URLs", async () => {
    for (const sourceUrl of ["http://example.com", "https://example.com/" + "a".repeat(2048)])
      check(
        (await errorCode(component("config:update", { sourceUrl }))) ===
          "MODELS_DEV_INVALID_ARGUMENT",
        `source URL ${sourceUrl.slice(0, 24)} accepted`,
      );
  });

  await step("anonymous callers cannot read or run maintenance", async () => {
    check(
      await publicClient.query(anyApi.example.syncStatus, {}).then(
        () => false,
        (error) => error.message.includes("Not signed in."),
      ),
      "anonymous public query accepted",
    );
    for (const [method, name] of [
      ["mutation", "configureSync"],
      ["action", "syncNow"],
    ])
      check(
        await publicClient[method](anyApi.example[name], {}).then(
          () => false,
          () => true,
        ),
        `anonymous ${name} accepted`,
      );
  });

  await step(
    "catalog guards keep Unicode, skip oversized rows and keep malformed providers",
    async () => {
      const unicode = JSON.parse(source.body);
      unicode.openai.models["gpt-5.4"].name = "x".repeat(499) + "😀";
      source.body = JSON.stringify(unicode);
      source.etag = '"fixture-2"';
      check((await action("syncForced")).status === "ok", "Unicode catalog rejected");
      const stored = await query("getModel", { key: "openai/gpt-5.4" });
      check(stored.name.endsWith("😀"), "Unicode string changed");

      const oversized = JSON.parse(source.body);
      oversized.openai.models["gpt-5.4"].family = "😀".repeat(257);
      source.body = JSON.stringify(oversized);
      source.etag = '"fixture-index-bound"';
      const skipped = await action("syncForced");
      check(
        skipped.status === "ok" &&
          skipped.skippedModels === 1 &&
          JSON.stringify(await query("getModel", { key: "openai/gpt-5.4" })) ===
            JSON.stringify(stored),
        "oversized index string changed stored row",
      );

      const malformedProvider = JSON.parse(source.body);
      malformedProvider.openai = null;
      source.body = JSON.stringify(malformedProvider);
      source.etag = '"fixture-invalid-provider"';
      check(
        (await action("syncForced")).status === "ok" &&
          JSON.stringify(await query("getModel", { key: "openai/gpt-5.4" })) ===
            JSON.stringify(stored),
        "malformed provider blocked sync or removed stored row",
      );
    },
  );

  await step("oversized catalogs and upstream failures record ordered source errors", async () => {
    const savedBody = source.body;
    source.body = source.body.padEnd(16 * 1024 * 1024 + 1, " ");
    source.etag = '"fixture-large"';
    const tooLarge = await action("syncForced");
    check(
      tooLarge.status === "error" &&
        tooLarge.errors.length === 2 &&
        tooLarge.errors.every((error) => error.code === "MODELS_DEV_CATALOG_TOO_LARGE"),
      "oversized catalog accepted",
    );
    source.body = savedBody;
    source.isFailing = true;
    const failed = await action("syncForced");
    check(
      failed.status === "error" &&
        failed.errors.length === 2 &&
        failed.errors[0].source === "primary" &&
        failed.errors[0].code === "MODELS_DEV_PROVIDER_ERROR" &&
        failed.errors[0].providerStatus === 503 &&
        failed.errors[0].retryable === true &&
        failed.errors[0].message === "The catalog provider returned a failure response." &&
        failed.errors[1].source === "fallback",
      "upstream error differs",
    );
    check(
      JSON.stringify((await query("syncStatus")).errors) === JSON.stringify(failed.errors),
      "stored error differs",
    );
  });

  await step("every catalog request reached the local fixture server", () => {
    check(
      source.requests.length > 0 &&
        source.requests.every((path) => path === "/primary" || path === "/fallback"),
      `unexpected fixture requests ${JSON.stringify(source.requests)}`,
    );
    console.log(`${checks} checks; ${source.requests.length} fixture catalog requests`);
  });
}

try {
  await runSmoke(journey, {
    prepareWorkspace: (workspace) => {
      pointConfigAtFixture(workspace, primaryUrl, fallbackUrl);
      writeTarballConsumer(workspace);
    },
  });
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
