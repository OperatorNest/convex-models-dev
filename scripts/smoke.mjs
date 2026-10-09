// Real-runtime smoke test on the anonymous local Convex backend (architecture rule 13).
// Syncs the public models.dev catalog through the example app and checks the main flows.
// Works locally and on a fresh CI checkout: no login, no committed .env.local.
// Usage: pnpm smoke
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { acquireLock } from "./with-local-lock.mjs";

const ENV_FILE = ".env.local";
const READY_TIMEOUT_MS = 120_000;
const POLL_MS = 1_000;
// A run killed mid-sync (for example by stopping the local backend) holds its lease for 3 minutes.
const LEASE_WAIT_MS = 5 * 60_000;
const LEASE_POLL_MS = 2_000;
const STOP_TIMEOUT_MS = 15_000;

const results = [];

class SmokeFailure extends Error {}

function convex(args, env = {}) {
  return spawnSync("pnpm", ["exec", "convex", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
}

function readEnvLocal() {
  if (!existsSync(ENV_FILE)) return {};
  const entries = readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter((match) => match !== null)
    .map((match) => [match[1], match[2].replace(/^"|"$/g, "")]);
  return Object.fromEntries(entries);
}

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) throw new SmokeFailure(`${name}${detail ? `: ${detail}` : ""}`);
}

/** The example imports the package by name, which resolves to `dist`. */
function build() {
  const result = spawnSync("pnpm", ["build"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0)
    throw new SmokeFailure(`pnpm build failed\n${result.stdout}${result.stderr}`);
}

/**
 * Starts `convex dev` and resolves once the functions are pushed. A fresh checkout gets an
 * anonymous local deployment, with no login. The dev server stays up for the whole run: stopping
 * the CLI stops the local backend, which would kill the catalog sync that the component's cron
 * starts right after the first push and leave its lease held.
 */
async function startDevServer() {
  const anonymous = existsSync(ENV_FILE) && "CONVEX_DEPLOYMENT" in readEnvLocal();
  const child = spawn(
    "pnpm",
    ["exec", "convex", "dev", "--typecheck", "disable", "--tail-logs", "disable"],
    {
      env: { ...process.env, ...(anonymous ? {} : { CONVEX_AGENT_MODE: "anonymous" }) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!output.includes("Convex functions ready")) {
    if (child.exitCode !== null) throw new SmokeFailure(`convex dev exited early\n${output}`);
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new SmokeFailure(`convex dev was not ready after ${READY_TIMEOUT_MS} ms\n${output}`);
    }
    await sleep(POLL_MS);
  }
  return {
    async stop() {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      const killer = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
      await exited;
      clearTimeout(killer);
    },
  };
}

function parseResult(name, text) {
  const trimmed = text.trim();
  // `convex run` prints nothing for a null result.
  if (trimmed === "") return null;
  for (let start = trimmed.length - 1; start >= 0; start--) {
    // The result is the last JSON value printed, after any function log lines.
    if (start > 0 && trimmed[start - 1] !== "\n") continue;
    try {
      return JSON.parse(trimmed.slice(start));
    } catch {
      // Keep scanning upwards until the whole trailing value parses.
    }
  }
  throw new SmokeFailure(`${name} returned unparseable output: ${text}`);
}

/** Runs an example function and returns `{ ok, value, output }`. */
function call(name, args = {}) {
  const result = convex(["run", name, JSON.stringify(args)]);
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0) return { ok: false, value: undefined, output };
  return { ok: true, value: parseResult(name, result.stdout), output };
}

function run(name, args = {}) {
  const outcome = call(name, args);
  if (!outcome.ok) throw new SmokeFailure(`${name} failed\n${outcome.output}`);
  return outcome.value;
}

/** Polls until the freshly started backend answers a query. */
async function waitForBackend() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const outcome = call("example:syncStatus");
    if (outcome.ok) return outcome.value;
    if (Date.now() > deadline) {
      throw new SmokeFailure(`backend not ready after ${READY_TIMEOUT_MS} ms\n${outcome.output}`);
    }
    await sleep(POLL_MS);
  }
}

/** Forced sync, waiting out a lease that another run (such as the startup cron tick) still holds. */
async function syncSettled(args) {
  const deadline = Date.now() + LEASE_WAIT_MS;
  for (;;) {
    const result = run("example:syncNow", args);
    if (result.status !== "skipped" || result.reason !== "already_running") return result;
    if (Date.now() > deadline) throw new SmokeFailure("sync lease was never released");
    console.log("   another run holds the sync lease, waiting");
    await sleep(LEASE_POLL_MS);
  }
}

const blended = (model) => (3 * (model.costInput ?? 0) + (model.costOutput ?? 0)) / 4;

let devServer;

async function main() {
  console.log("1. build the package and start the example app on the local backend");
  build();
  devServer = await startDevServer();
  const env = readEnvLocal();
  check(
    "deployment configured",
    env.CONVEX_DEPLOYMENT,
    "CONVEX_DEPLOYMENT missing from .env.local",
  );
  const initial = await waitForBackend();
  check(
    "backend answers queries",
    ["never_synced", "ok"].includes(initial.state),
    JSON.stringify(initial),
  );

  console.log("2. sync the live models.dev catalog");
  const started = Date.now();
  const sync = await syncSettled({ force: true });
  const wallMs = Date.now() - started;
  check(
    "forced sync finished ok or unchanged",
    ["ok", "not_modified"].includes(sync.status),
    JSON.stringify(sync),
  );
  const status = run("example:syncStatus");
  check(
    "sync stayed within the time budget",
    (sync.durationMs ?? 0) < 120_000,
    `${sync.durationMs} ms`,
  );
  check("state is ok", status.state === "ok", status.state);
  check(
    "lease released",
    status.running === false && status.leaseExpiresAt === undefined,
    JSON.stringify(status),
  );
  check("no error recorded", status.lastError === undefined && status.lastStatus !== "error");
  check(
    "catalog is large",
    status.modelCount > 1000 && status.providerCount > 50,
    `${status.modelCount} models, ${status.providerCount} providers`,
  );

  console.log("3. repeat syncs use the interval floor and the conditional fetch");
  const skipped = run("example:syncNow", {});
  check(
    "non-forced repeat is skipped by the interval floor",
    skipped.status === "skipped" && skipped.reason === "min_interval",
    JSON.stringify(skipped),
  );
  let repeat = await syncSettled({ force: true });
  for (let i = 0; i < 2 && repeat.status !== "not_modified"; i++) {
    // The upstream catalog may change between two syncs; the next one must settle.
    repeat = await syncSettled({ force: true });
  }
  check("forced repeat is not_modified", repeat.status === "not_modified", JSON.stringify(repeat));

  console.log("4. read the catalog");
  const first = run("example:listModels", { cursor: null, numItems: 10 });
  check(
    "first page is full and not done",
    first.page.length === 10 && first.isDone === false,
    `${first.page.length} rows`,
  );
  const second = run("example:listModels", { cursor: first.continueCursor, numItems: 10 });
  const seen = new Set(first.page.map((m) => `${m.providerId}/${m.modelId}`));
  check(
    "second page has rows and does not overlap",
    second.page.length > 0 && second.page.every((m) => !seen.has(`${m.providerId}/${m.modelId}`)),
  );

  const pick = first.page.find(
    (m) => !m.providerId.includes(".") && (m.costInput ?? 0) > 0 && (m.costOutput ?? 0) > 0,
  );
  check("page 1 holds a priced model to test with", pick !== undefined);
  const key = `${pick.providerId}/${pick.modelId}`;
  const bySlash = run("example:getModel", { key });
  check(
    "getModel by provider/model",
    bySlash?.modelId === pick.modelId && bySlash.providerId === pick.providerId,
    key,
  );
  const byColon = run("example:getModel", { key: `${pick.providerId}:${pick.modelId}` });
  check("getModel by provider:model", byColon?.modelId === pick.modelId);
  check(
    "getModel misses cleanly",
    run("example:getModel", { key: "no-such-provider/none" }) === null,
  );

  const cheap = run("example:cheapestWithTools", {});
  check(
    "cheapest returns priced models",
    cheap.length > 0 && cheap.every((m) => m.costInput !== undefined),
  );
  check(
    "cheapest is ordered by blended price",
    cheap.every((m, i) => i === 0 || blended(cheap[i - 1]) <= blended(m)),
  );

  console.log("5. price a usage report");
  const nano = run("example:costOfUsage", {
    provider: pick.providerId,
    model: pick.modelId,
    rawUsage: { inputTokens: 1000, outputTokens: 500 },
  });
  const expected =
    Math.round(1000 * pick.costInput * 1e3) + Math.round(500 * pick.costOutput * 1e3);
  check(
    "costOfUsage equals tokens x price in nano-USD",
    nano === expected,
    `${nano} vs ${expected}`,
  );
  check(
    "unknown model is priced as null",
    run("example:costOfUsage", {
      provider: "no-such-provider",
      model: "none",
      rawUsage: { inputTokens: 1 },
    }) === null,
  );

  console.log("6. configuration errors carry a code");
  const rejected = call("example:configureSync", { minModels: -1 });
  check(
    "invalid config is rejected with MODELS_DEV_INVALID_CONFIG",
    !rejected.ok && rejected.output.includes("MODELS_DEV_INVALID_CONFIG"),
    rejected.output.slice(0, 300),
  );

  return { sync, wallMs, status, key, nano, first, second, cheap };
}

let release = () => {};
try {
  release = await acquireLock();
  const r = await main();
  console.log(
    [
      `SMOKE OK (${results.length} checks)`,
      `  deployment: ${readEnvLocal().CONVEX_URL ?? "n/a"}`,
      `  sync: ${r.sync.status}, durationMs=${r.sync.durationMs ?? "n/a"}, wall=${r.wallMs} ms`,
      `  catalog: ${r.status.modelCount} models, ${r.status.providerCount} providers`,
      `  model under test: ${r.key}; cheapest tool-calling: ${r.cheap[0].providerId}/${r.cheap[0].modelId}`,
      `  costOfUsage(1000 in, 500 out): ${r.nano} nano-USD`,
      `  list: page1=${r.first.page.length}, page2=${r.second.page.length}`,
    ].join("\n"),
  );
} catch (error) {
  for (const { name, ok } of results) console.error(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  console.error(`SMOKE FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await devServer?.stop();
  release();
}
