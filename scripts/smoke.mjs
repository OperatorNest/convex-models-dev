import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer as netServer } from "node:net";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import ts from "typescript";
import { acquireLock } from "./with-local-lock.mjs";

const root = resolve(import.meta.dirname, "..");
const workspace = mkdtempSync(join(tmpdir(), "models-dev-smoke-"));
const convexBin = join(root, "node_modules/convex/bin/main.js");
const childEnv = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
for (const key of [
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_URL",
  "CONVEX_SITE_URL",
])
  delete childEnv[key];
let dev;
let server;
let client;
let publicClient;
let checks = 0;
let body;
let etag = '"fixture-1"';
let fail = false;
function check(condition, message) {
  if (!condition) throw new Error(`Smoke: ${message}`);
  checks++;
}
async function freePort() {
  const socket = netServer();
  await new Promise((resolvePort, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolvePort);
  });
  const address = socket.address();
  check(address && typeof address !== "string", "ephemeral port unavailable");
  await new Promise((resolveClose) => socket.close(resolveClose));
  return address.port;
}
async function waitFor(fn) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error("Smoke: local backend did not become ready");
}
const cli = (...args) =>
  execFileSync(process.execPath, [convexBin, ...args], {
    cwd: workspace,
    env: childEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
async function start() {
  execFileSync("pnpm", ["build"], { cwd: root, env: childEnv, stdio: "pipe" });
  const archive = join(workspace, "package.tgz");
  execFileSync("pnpm", ["pack", "--out", archive], { cwd: root, env: childEnv, stdio: "pipe" });
  const installed = join(workspace, "node_modules/@operatornest/convex-models-dev");
  mkdirSync(installed, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", installed], {
    env: childEnv,
    stdio: "pipe",
  });
  for (const entry of readdirSync(join(root, "node_modules"))) {
    if (entry === "@operatornest") continue;
    symlinkSync(join(root, "node_modules", entry), join(workspace, "node_modules", entry), "dir");
  }
  cpSync(join(root, "example"), join(workspace, "example"), { recursive: true });
  rmSync(join(workspace, "example/convex/example.test.ts"));
  cpSync(join(root, "convex.json"), join(workspace, "convex.json"));
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({
      name: "models-dev-smoke-consumer",
      private: true,
      type: "module",
      dependencies: {
        "@operatornest/convex-models-dev": "file:./package.tgz",
        ...JSON.parse(readFileSync(join(root, "package.json"), "utf8")).peerDependencies,
      },
    }),
  );
  writeFileSync(
    join(workspace, "consumer.ts"),
    `
import { ModelsDev, estimateCost } from "@operatornest/convex-models-dev";
import { register } from "@operatornest/convex-models-dev/test";
import { components } from "./example/convex/_generated/api.js";
export const models = new ModelsDev(components.modelsDev);
export { estimateCost, register };
`,
  );
  writeFileSync(
    join(workspace, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        target: "ESNext",
        lib: ["ES2023", "DOM"],
        module: "ESNext",
        moduleResolution: "Bundler",
        types: [],
      },
      include: ["consumer.ts", "example/convex/**/*.ts"],
      exclude: ["**/*.test.ts"],
    }),
  );
  execFileSync(
    process.execPath,
    [join(root, "node_modules/@typescript/native/bin/tsc"), "--noEmit"],
    {
      cwd: workspace,
      env: childEnv,
      stdio: "pipe",
    },
  );
  check(true, "strict tarball consumer typecheck failed");
  writeFileSync(
    join(workspace, "vitest.config.mjs"),
    `
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "edge-runtime",
  server: { deps: { inline: ["@operatornest/convex-models-dev"] } } } });
`,
  );
  writeFileSync(
    join(workspace, "consumer.test.ts"),
    `
import { register } from "@operatornest/convex-models-dev/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./example/convex/_generated/api.js";
import schema from "./example/convex/schema.js";
const modules = import.meta.glob("./example/convex/**/*.ts");
test("installed test entrypoint registers component queries", async () => {
  const t = convexTest(schema, modules);
  register(t);
  expect(await t.withIdentity({ subject: "reader" }).query(api.example.syncStatus, {}))
    .toMatchObject({ state: "never_synced", modelCount: 0 });
  await expect(t.query(api.example.syncStatus, {})).rejects.toThrow("Not signed in.");
});
`,
  );
  execFileSync(process.execPath, [join(root, "node_modules/vitest/vitest.mjs"), "run"], {
    cwd: workspace,
    env: childEnv,
    stdio: "pipe",
  });
  check(true, "tarball consumer test failed");
  const fixtureSource = readFileSync(join(root, "src/fixtures/api.fixture.ts"), "utf8");
  const fixtureJs = ts.transpileModule(fixtureSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  const { fixtureCatalog } = await import(
    `data:text/javascript;base64,${Buffer.from(fixtureJs).toString("base64")}`
  );
  const catalog = structuredClone(fixtureCatalog);
  const template = catalog.openai.models["gpt-5-mini"];
  for (let i = 0; i < 50; i++)
    catalog[`fixture-${i}`] = {
      name: `Fixture ${i}`,
      models: Object.fromEntries(
        Array.from({ length: 20 }, (_, j) => [
          `model-${j}`,
          { ...template, name: `Fixture model ${j}` },
        ]),
      ),
    };
  body = JSON.stringify(catalog);
  const sourcePort = await freePort();
  server = createServer((request, response) => {
    if (fail) {
      response.writeHead(503);
      response.end("fixture failure");
      return;
    }
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag });
    response.end(body);
  });
  await new Promise((resolveListen) => server.listen(sourcePort, "127.0.0.1", resolveListen));
  for (const relative of ["src/component/config.ts", "dist/component/config.js"]) {
    const configPath = join(installed, relative);
    const config = readFileSync(configPath, "utf8")
      .replace("https://models.dev/api.json", `http://127.0.0.1:${sourcePort}/primary`)
      .replace("https://models.opencode.ai/api.json", `http://127.0.0.1:${sourcePort}/fallback`);
    writeFileSync(configPath, config);
  }
  const cloud = await freePort();
  const site = await freePort();
  dev = spawn(
    process.execPath,
    [
      convexBin,
      "dev",
      "--typecheck",
      "enable",
      "--tail-logs",
      "disable",
      "--local-cloud-port",
      String(cloud),
      "--local-site-port",
      String(site),
    ],
    { cwd: workspace, env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  for (const stream of [dev.stdout, dev.stderr])
    stream.on("data", (chunk) => {
      output += chunk.toString();
      writeFileSync(join(workspace, "dev.log"), output);
    });
  await waitFor(() => {
    if (dev.exitCode !== null) throw new Error("Smoke: local Convex process exited");
    return output.includes("Convex functions ready");
  });
  const local = JSON.parse(
    readFileSync(join(workspace, ".convex/local/default/config.json"), "utf8"),
  );
  const url = `http://127.0.0.1:${local.ports.cloud}`;
  client = new ConvexHttpClient(url, { logger: false });
  client.setAdminAuth(local.adminKey, {
    subject: "smoke",
    issuer: "local",
    tokenIdentifier: "local|smoke",
  });
  publicClient = new ConvexHttpClient(url, { logger: false });
}
const query = (name, args = {}) => client.query(anyApi.example[name], args);
const action = (name, args = {}) => client.action(anyApi.example[name], args);
function component(name, args) {
  const result = cli("run", "--component", "modelsDev", name, JSON.stringify(args));
  return result.trim() ? JSON.parse(result) : null;
}
function errorCode(fn) {
  try {
    fn();
    return "accepted";
  } catch (error) {
    return /MODELS_DEV_[A-Z_]+/.exec(String(error.stderr))?.[0] ?? "unknown";
  }
}
async function journey() {
  await client.mutation(anyApi.example.configureSync, { minProviders: 1, minModels: 1 });
  let synced;
  await waitFor(async () => {
    synced = await action("syncNow", { force: true });
    return synced.reason !== "already_running";
  });
  check(["ok", "not_modified"].includes(synced.status), "fixture sync failed");
  const status = await query("syncStatus");
  check(
    status.modelCount === 1021 &&
      status.providerCount === 55 &&
      !status.running &&
      status.errors.length === 0,
    "sync counts or lease differ",
  );
  check((await action("syncNow")).reason === "min_interval", "interval floor failed");
  check(
    (await action("syncNow", { force: true })).status === "not_modified",
    "conditional fetch failed",
  );
  const first = await query("listModels", { cursor: null, numItems: 10 });
  const next = await query("listModels", { cursor: first.continueCursor, numItems: 10 });
  const keys = new Set(first.page.map((row) => JSON.stringify([row.providerId, row.modelId])));
  check(
    first.page.length === 10 &&
      next.page.length === 10 &&
      next.page.every((row) => !keys.has(JSON.stringify([row.providerId, row.modelId]))),
    "pagination overlapped",
  );
  check(
    (await query("getModel", { key: "openai/gpt-5.4" })).costInput === 2.5,
    "model lookup failed",
  );
  check(
    (await query("costOfUsage", {
      provider: "anthropic.messages",
      model: "claude-sonnet-4-5",
      rawUsage: { inputTokens: 1000, outputTokens: 500 },
    })) === 10500000,
    "cost differs",
  );
  check(
    await query("costOfUsage", {
      provider: "openai",
      model: "gpt-5.4",
      rawUsage: { inputTokens: 1e308 },
    }).then(
      () => false,
      (error) => error.message.includes("MODELS_DEV_INVALID_ARGUMENT"),
    ),
    "unsafe usage accepted",
  );
  check((await query("cheapestWithTools")).models.length > 0, "capability query empty");
  for (const cursor of ["not-json", "{}", "[{}]"])
    check(
      errorCode(() => component("models:list", { paginationOpts: { numItems: 1, cursor } })) ===
        "MODELS_DEV_INVALID_ARGUMENT",
      "cursor error differs",
    );
  const pinned = component("models:list", {
    includeDeprecated: true,
    paginationOpts: { numItems: 1, cursor: null, endCursor: "[]" },
  });
  check(
    pinned.pageStatus === "SplitRequired" &&
      typeof pinned.splitCursor === "string" &&
      pinned.page.length <= 2,
    "pinned split metadata missing",
  );
  const bytes = component("models:list", {
    paginationOpts: { numItems: 100, cursor: null, maximumBytesRead: 1 },
  });
  check(bytes.page.length <= 1 && bytes.pageStatus === "SplitRequired", "byte budget ignored");
  check(
    errorCode(() => component("config:configure", { sourceUrl: "http://example.com" })) ===
      "MODELS_DEV_INVALID_SOURCE_URL",
    "source error differs",
  );
  check(
    errorCode(() =>
      component("config:configure", { sourceUrl: "https://example.com/" + "a".repeat(2048) }),
    ) === "MODELS_DEV_INVALID_SOURCE_URL",
    "oversized URL accepted",
  );
  const denied = await publicClient.query(anyApi.example.syncStatus, {}).then(
    () => false,
    (error) => error.message.includes("Not signed in."),
  );
  check(denied, "anonymous public query accepted");
  for (const [method, name] of [
    ["mutation", "configureSync"],
    ["action", "syncNow"],
  ])
    check(
      await publicClient[method](anyApi.example[name], {}).then(
        () => false,
        () => true,
      ),
      "anonymous maintenance accepted",
    );
  const malformed = JSON.parse(body);
  malformed.openai.models["gpt-5.4"].name = "x".repeat(499) + "😀";
  body = JSON.stringify(malformed);
  etag = '"fixture-2"';
  check((await action("syncNow", { force: true })).status === "ok", "Unicode catalog rejected");
  check(
    (await query("getModel", { key: "openai/gpt-5.4" })).name.endsWith("😀"),
    "Unicode string changed",
  );
  for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    check(
      errorCode(() =>
        component("models:estimate", {
          provider: "openai",
          model: "gpt-5.4",
          usage: { inputTokens: count },
        }),
      ) === "MODELS_DEV_INVALID_ARGUMENT",
      "invalid token count accepted",
    );
  check(
    component("models:estimate", {
      provider: "openai",
      model: "gpt-5.4",
      usage: { inputTokens: 10 },
      mode: "absent",
    }).known === false,
    "unpriced mode accepted",
  );
  const cheapest = component("models:cheapest", {
    providerIds: ["openai", "anthropic"],
    limit: 20,
  });
  check(
    cheapest.isComplete &&
      cheapest.models.length > 0 &&
      cheapest.models.every((row) => ["openai", "anthropic"].includes(row.providerId)),
    "provider cost ranges differ",
  );
  const stored = await query("getModel", { key: "openai/gpt-5.4" });
  const oversized = JSON.parse(body);
  oversized.openai.models["gpt-5.4"].family = "😀".repeat(257);
  body = JSON.stringify(oversized);
  etag = '"fixture-index-bound"';
  const skipped = await action("syncNow", { force: true });
  check(
    skipped.status === "ok" &&
      skipped.skippedModels === 1 &&
      JSON.stringify(await query("getModel", { key: "openai/gpt-5.4" })) === JSON.stringify(stored),
    "oversized index string changed stored row",
  );
  const provider = JSON.parse(body);
  provider.openai = null;
  body = JSON.stringify(provider);
  etag = '"fixture-invalid-provider"';
  check(
    (await action("syncNow", { force: true })).status === "ok" &&
      JSON.stringify(await query("getModel", { key: "openai/gpt-5.4" })) === JSON.stringify(stored),
    "malformed provider blocked sync or removed stored row",
  );
  const savedBody = body;
  body = body.padEnd(16 * 1024 * 1024 + 1, " ");
  etag = '"fixture-large"';
  const tooLarge = await action("syncNow", { force: true });
  check(
    tooLarge.status === "error" &&
      tooLarge.errors.length === 2 &&
      tooLarge.errors.every((error) => error.code === "MODELS_DEV_CATALOG_TOO_LARGE"),
    "oversized catalog accepted",
  );
  body = savedBody;
  fail = true;
  const failed = await action("syncNow", { force: true });
  check(
    failed.status === "error" &&
      failed.error.code === "MODELS_DEV_FETCH_FAILED" &&
      failed.error.providerStatus === 503 &&
      failed.error.message === "The catalog request failed." &&
      failed.errors.length === 2 &&
      failed.errors[0].source === "primary" &&
      failed.errors[1].source === "fallback",
    "upstream error differs",
  );
  check(
    JSON.stringify((await query("syncStatus")).errors) === JSON.stringify(failed.errors),
    "stored error differs",
  );
}
const release = await acquireLock();
try {
  await start();
  await journey();
  console.log(`SMOKE OK: ${checks} checks on an isolated local fixture deployment`);
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith("Smoke:")
      ? error.message
      : "Smoke: local journey failed",
  );
  process.exitCode = 1;
} finally {
  if (dev && dev.exitCode === null) {
    dev.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => dev.once("exit", resolveExit)), sleep(10000)]);
    if (dev.exitCode === null) dev.kill("SIGKILL");
  }
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(workspace, { recursive: true, force: true });
  release();
}
