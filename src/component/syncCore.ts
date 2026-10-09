import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.js";
import { internal } from "./_generated/api.js";
import type { ActionCtx } from "./_generated/server.js";
import { FALLBACK_SOURCE_URL, type EffectiveConfig } from "./config.js";
import { rowHash, sha256Hex } from "../shared/hash.js";
import { isRecord } from "../shared/guards.js";
import {
  inspectCatalog,
  normalizeModel,
  normalizeProvider,
  type CatalogShape,
} from "../shared/normalize.js";
import type { ModelInput, ProviderInput, SyncSummary } from "../shared/validators.js";

export const USER_AGENT =
  "@operatornest/convex-models-dev (+https://github.com/OperatorNest/convex-models-dev)";

const CHUNK_SIZE = 300;
const FETCH_TIMEOUT_MS = 60_000;
const REMOVAL_GUARD_FRACTION = 0.2;

type PriorState = { source: string; etag?: string; contentHash?: string } | undefined;

type Loaded =
  | { kind: "not_modified"; url: string; etag?: string; contentHash?: string }
  | {
      kind: "data";
      url: string;
      etag?: string;
      contentHash: string;
      catalog: Record<string, unknown>;
      shape: CatalogShape;
    };

class LeaseLost extends Error {
  constructor() {
    super("lease_lost");
  }
}

function messageOf(error: unknown): string {
  if (
    error instanceof ConvexError &&
    isRecord(error.data) &&
    typeof error.data.message === "string"
  ) {
    const code = typeof error.data.code === "string" ? `${error.data.code}: ` : "";
    return `${code}${error.data.message}`.slice(0, 500);
  }
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

/** Downloads, hashes, parses and shape-checks one source. Holds one copy of the data. */
async function loadCatalog(
  url: string,
  state: PriorState,
  config: EffectiveConfig,
): Promise<Loaded> {
  const sameSource = state?.source === url;
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: "application/json",
  };
  if (sameSource && state?.etag) headers["if-none-match"] = state.etag;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let buffer: ArrayBuffer | null;
  let etag: string | undefined;
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (response.status === 304 && headers["if-none-match"]) {
      return { kind: "not_modified", url };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    etag = response.headers.get("etag") ?? undefined;
    buffer = await response.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }

  const contentHash = await sha256Hex(buffer);
  if (sameSource && state?.contentHash === contentHash) {
    return { kind: "not_modified", url, ...(etag && { etag }), contentHash };
  }

  let text: string | null = new TextDecoder().decode(buffer);
  buffer = null;
  const parsed: unknown = JSON.parse(text);
  text = null;

  if (!isRecord(parsed)) throw new Error("catalog is not an object");
  const shape = inspectCatalog(parsed);
  if (shape.providerCount < config.minProviders || shape.modelCount < config.minModels) {
    throw new Error(
      `catalog too small (${shape.providerCount} providers, ${shape.modelCount} models); refusing to sync`,
    );
  }
  return {
    kind: "data",
    url,
    ...(etag && { etag }),
    contentHash,
    catalog: parsed,
    shape,
  };
}

async function applyCatalog(
  ctx: ActionCtx,
  loaded: Extract<Loaded, { kind: "data" }>,
  opts: { runId: string; force: boolean; recordAdded: boolean },
) {
  const { catalog } = loaded;
  const keep = new Set<string>();
  const keepProviders = new Set<string>();
  const totals = { added: 0, updated: 0, priceChanges: 0, skippedModels: 0, removed: 0 };

  const providerRows: ProviderInput[] = [];
  for (const [providerId, provider] of Object.entries(catalog)) {
    const models = isRecord(provider) ? provider.models : undefined;
    const count = isRecord(models) ? Object.keys(models).length : 0;
    const row = normalizeProvider(providerId, provider, count);
    if (!row) continue;
    keepProviders.add(providerId);
    providerRows.push({ ...row, contentHash: await rowHash(row) });
  }
  for (let i = 0; i < providerRows.length; i += CHUNK_SIZE) {
    const written = await ctx.runMutation(internal.sync.upsertProviders, {
      runId: opts.runId,
      providers: providerRows.slice(i, i + CHUNK_SIZE),
    });
    if (written.leaseLost) throw new LeaseLost();
  }

  let buffer: ModelInput[] = [];
  const flush = async () => {
    if (buffer.length === 0) return;
    const rows = buffer;
    buffer = [];
    const result = await ctx.runMutation(internal.sync.upsertModels, {
      runId: opts.runId,
      rows,
      recordAdded: opts.recordAdded,
    });
    if (result.leaseLost) throw new LeaseLost();
    totals.added += result.added;
    totals.updated += result.updated;
    totals.priceChanges += result.priceChanges;
  };

  for (const providerId of Object.keys(catalog)) {
    const provider = catalog[providerId];
    if (!keepProviders.has(providerId)) continue;
    const models = isRecord(provider) ? provider.models : undefined;
    if (isRecord(models)) {
      for (const [modelId, raw] of Object.entries(models)) {
        keep.add(`${providerId}\u0000${modelId}`);
        const row = normalizeModel(providerId, modelId, raw);
        if (!row) {
          totals.skippedModels++;
          continue;
        }
        buffer.push({ ...row, contentHash: await rowHash(row) });
        if (buffer.length >= CHUNK_SIZE) await flush();
      }
    }
    // Release this provider's models before moving on.
    if (isRecord(provider)) delete provider.models;
  }
  await flush();

  const stale: Id<"models">[] = [];
  let existing = 0;
  let cursor: string | null = null;
  for (;;) {
    const page: Awaited<ReturnType<typeof pageModels>> = await pageModels(ctx, cursor);
    for (const entry of page.page) {
      existing++;
      if (!keep.has(`${entry.providerId}\u0000${entry.modelId}`)) stale.push(entry.id);
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
  }

  let removalSkipped = false;
  if (stale.length > 0) {
    if (!opts.force && stale.length > existing * REMOVAL_GUARD_FRACTION) {
      removalSkipped = true;
    } else {
      for (let i = 0; i < stale.length; i += CHUNK_SIZE) {
        const result = await ctx.runMutation(internal.sync.removeModels, {
          runId: opts.runId,
          ids: stale.slice(i, i + CHUNK_SIZE),
        });
        if (result.leaseLost) throw new LeaseLost();
        totals.removed += result.removed;
      }
    }
  }

  const staleProviders: Id<"providers">[] = [];
  let providerCursor: string | null = null;
  for (;;) {
    const page: Awaited<ReturnType<typeof pageProviders>> = await pageProviders(
      ctx,
      providerCursor,
    );
    for (const entry of page.page) {
      if (!keepProviders.has(entry.providerId)) staleProviders.push(entry.id);
    }
    if (page.isDone) break;
    providerCursor = page.continueCursor;
  }
  if (staleProviders.length > 0 && !removalSkipped) {
    for (let i = 0; i < staleProviders.length; i += CHUNK_SIZE) {
      const result = await ctx.runMutation(internal.sync.removeProviders, {
        runId: opts.runId,
        ids: staleProviders.slice(i, i + CHUNK_SIZE),
      });
      if (result.leaseLost) throw new LeaseLost();
    }
  }

  return { ...totals, removalSkipped };
}

function pageModels(ctx: ActionCtx, cursor: string | null) {
  return ctx.runQuery(internal.sync.modelKeysPage, { cursor, numItems: CHUNK_SIZE });
}

function pageProviders(ctx: ActionCtx, cursor: string | null) {
  return ctx.runQuery(internal.sync.providerKeysPage, { cursor, numItems: CHUNK_SIZE });
}

/** One full sync: lease, conditional fetch, validate, chunked upsert, guarded removal, finish. */
export async function runSync(
  ctx: ActionCtx,
  opts: { force: boolean; cron: boolean },
): Promise<SyncSummary> {
  const runId = crypto.randomUUID();
  const started = Date.now();
  const begin = await ctx.runMutation(internal.sync.begin, {
    runId,
    force: opts.force,
    cron: opts.cron,
  });
  if (!begin.proceed) return { status: "skipped", reason: begin.reason };

  const { config, state, isFirstSync } = begin;
  const urls = [...new Set([config.sourceUrl, FALLBACK_SOURCE_URL])];
  let failure = "no source available";
  try {
    let loaded: Loaded | undefined;
    for (const url of urls) {
      try {
        loaded = await loadCatalog(url, state, config);
        break;
      } catch (error) {
        failure = `${new URL(url).host}: ${messageOf(error)}`;
      }
    }
    if (!loaded) throw new Error(failure);

    if (loaded.kind === "not_modified") {
      const durationMs = Date.now() - started;
      const recorded = await ctx.runMutation(internal.sync.finish, {
        runId,
        status: "not_modified",
        source: loaded.url,
        ...(loaded.etag && { etag: loaded.etag }),
        ...(loaded.contentHash && { contentHash: loaded.contentHash }),
        durationMs,
      });
      if (!recorded) throw new LeaseLost();
      return { status: "not_modified", source: loaded.url, durationMs };
    }

    const stats = await applyCatalog(ctx, loaded, {
      runId,
      force: opts.force,
      recordAdded: !isFirstSync,
    });
    const durationMs = Date.now() - started;
    const finalStats = {
      providerCount: loaded.shape.providerCount,
      modelCount: loaded.shape.modelCount,
      added: stats.added,
      updated: stats.updated,
      removed: stats.removed,
      priceChanges: stats.priceChanges,
      skippedModels: stats.skippedModels,
      removalSkipped: stats.removalSkipped,
    };
    // The etag is written last, so any failure above retries on the next tick.
    const status = stats.removalSkipped ? "partial" : "ok";
    const recorded = await ctx.runMutation(internal.sync.finish, {
      runId,
      status,
      source: loaded.url,
      ...(loaded.etag && { etag: loaded.etag }),
      contentHash: loaded.contentHash,
      stats: finalStats,
      durationMs,
    });
    if (!recorded) throw new LeaseLost();
    return { status, source: loaded.url, ...finalStats, durationMs };
  } catch (error) {
    // A run that lost its lease must not write anything else, including its failure.
    if (error instanceof LeaseLost) {
      return { status: "error", reason: "lease_lost", durationMs: Date.now() - started };
    }
    const reason = messageOf(error);
    await ctx.runMutation(internal.sync.finish, {
      runId,
      status: "error",
      error: reason,
      durationMs: Date.now() - started,
    });
    return { status: "error", reason, durationMs: Date.now() - started };
  }
}
