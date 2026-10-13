import { isModelsDevError, modelsDevError, type ModelsDevErrorData } from "../shared/errors.js";
import { jsonBytes, wellFormed } from "../shared/bounds.js";
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
import type {
  ModelInput,
  ProviderInput,
  SyncSummary,
  SyncSourceError,
} from "../shared/validators.js";

export const USER_AGENT =
  "@operatornest/convex-models-dev (+https://github.com/OperatorNest/convex-models-dev)";

const CHUNK_SIZE = 100;
const MAX_BATCH_BYTES = 512 * 1024;
const MAX_CATALOG_BYTES = 16 * 1024 * 1024;
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

function failureData(
  error: unknown,
  code: "MODELS_DEV_NETWORK_ERROR" | "MODELS_DEV_SYNC_FAILED",
): ModelsDevErrorData {
  return isModelsDevError(error) ? error.data : modelsDevError(code).data;
}
async function readCatalog(response: Response): Promise<Uint8Array<ArrayBuffer>> {
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_CATALOG_BYTES) {
    await response.body?.cancel();
    throw modelsDevError("MODELS_DEV_CATALOG_TOO_LARGE");
  }
  if (!response.body) throw modelsDevError("MODELS_DEV_INVALID_RESPONSE");
  const reader = response.body.getReader();
  const buffer = new ArrayBuffer(MAX_CATALOG_BYTES);
  const data = new Uint8Array(buffer);
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (bytes + chunk.value.byteLength > MAX_CATALOG_BYTES) {
        await reader.cancel();
        throw modelsDevError("MODELS_DEV_CATALOG_TOO_LARGE");
      }
      data.set(chunk.value, bytes);
      bytes += chunk.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return data.subarray(0, bytes);
}

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
  let buffer: Uint8Array<ArrayBuffer> | null;
  let etag: string | undefined;
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (response.status === 304 && headers["if-none-match"]) {
      return { kind: "not_modified", url };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw modelsDevError("MODELS_DEV_PROVIDER_ERROR", {
        providerStatus: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    const responseEtag = response.headers.get("etag");
    etag =
      responseEtag && wellFormed(responseEtag) && responseEtag.length <= 2048
        ? responseEtag
        : undefined;
    buffer = await readCatalog(response);
  } finally {
    clearTimeout(timer);
  }

  const contentHash = await sha256Hex(buffer);
  if (sameSource && state?.contentHash === contentHash) {
    return { kind: "not_modified", url, ...(etag && { etag }), contentHash };
  }

  let text: string | null = new TextDecoder().decode(buffer);
  buffer = null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw modelsDevError("MODELS_DEV_INVALID_RESPONSE");
  }
  text = null;

  if (!isRecord(parsed)) throw modelsDevError("MODELS_DEV_INVALID_RESPONSE");
  const shape = inspectCatalog(parsed);
  if (shape.providerCount < config.minProviders || shape.modelCount < config.minModels) {
    throw modelsDevError("MODELS_DEV_CATALOG_TOO_SMALL");
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

function identity(modelsDevProviderId: string, modelsDevModelId: string) {
  return JSON.stringify([modelsDevProviderId, modelsDevModelId]);
}

async function applyCatalog(
  ctx: ActionCtx,
  loaded: Extract<Loaded, { kind: "data" }>,
  opts: { runId: string; force: boolean; recordAdded: boolean },
) {
  const { catalog } = loaded;
  const keep = new Set<string>();

  const snapshot: {
    modelId: Id<"models">;
    modelsDevProviderId: string;
    modelsDevModelId: string;
    hasCost: boolean;
  }[] = [];
  let snapshotCursor: string | null = null;
  for (;;) {
    const page: Awaited<ReturnType<typeof pageModels>> = await pageModels(ctx, snapshotCursor);
    snapshot.push(...page.page);
    if (page.isDone) break;
    snapshotCursor = page.continueCursor;
  }
  const keepProviders = new Set(Object.keys(catalog));
  const usableProviders = new Set<string>();
  const totals = {
    added: 0,
    updated: 0,
    priceChanges: 0,
    skippedModels: loaded.shape.skippedModels,
    removed: 0,
  };

  const providerRows: ProviderInput[] = [];
  for (const [modelsDevProviderId, provider] of Object.entries(catalog)) {
    const models = isRecord(provider) ? provider.models : undefined;
    const count = isRecord(models) ? Object.keys(models).length : 0;
    const row = isRecord(models) ? normalizeProvider(modelsDevProviderId, provider, count) : null;
    if (!row) continue;
    usableProviders.add(modelsDevProviderId);
    providerRows.push({ ...row, contentHash: await rowHash(row) });
  }
  let priced = 0;
  let lostPrices = 0;
  for (const entry of snapshot) {
    if (
      !usableProviders.has(entry.modelsDevProviderId) &&
      keepProviders.has(entry.modelsDevProviderId)
    )
      keep.add(identity(entry.modelsDevProviderId, entry.modelsDevModelId));
    if (!entry.hasCost) continue;
    priced++;
    if (!usableProviders.has(entry.modelsDevProviderId)) continue;
    const provider = catalog[entry.modelsDevProviderId];
    const models = isRecord(provider) ? provider.models : undefined;
    const raw = isRecord(models) ? models[entry.modelsDevModelId] : undefined;
    const row = normalizeModel(entry.modelsDevProviderId, entry.modelsDevModelId, raw);
    if (row && !row.hasCost) lostPrices++;
  }
  if (!opts.force && lostPrices > priced * REMOVAL_GUARD_FRACTION)
    return { ...totals, removalSkipped: true };

  let providers: ProviderInput[] = [];
  let providerBytes = 0;
  const flushProviders = async () => {
    if (!providers.length) return;
    const written = await ctx.runMutation(internal.sync.upsertProviders, {
      runId: opts.runId,
      providers,
    });
    if (written.leaseLost) throw new LeaseLost();
    providers = [];
    providerBytes = 0;
  };
  for (const row of providerRows) {
    const bytes = jsonBytes(row);
    if (providers.length >= CHUNK_SIZE || providerBytes + bytes > MAX_BATCH_BYTES)
      await flushProviders();
    providers.push(row);
    providerBytes += bytes;
  }
  await flushProviders();

  let buffer: ModelInput[] = [];
  let bufferBytes = 0;
  const flush = async () => {
    if (buffer.length === 0) return;
    const rows = buffer;
    buffer = [];
    bufferBytes = 0;
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

  for (const modelsDevProviderId of Object.keys(catalog)) {
    const provider = catalog[modelsDevProviderId];
    if (!usableProviders.has(modelsDevProviderId)) continue;
    const models = isRecord(provider) ? provider.models : undefined;
    if (isRecord(models)) {
      for (const [modelsDevModelId, raw] of Object.entries(models)) {
        keep.add(identity(modelsDevProviderId, modelsDevModelId));
        const row = normalizeModel(modelsDevProviderId, modelsDevModelId, raw);
        if (!row) {
          continue;
        }
        const input = { ...row, contentHash: await rowHash(row) };
        const bytes = jsonBytes(input);
        if (buffer.length >= CHUNK_SIZE || bufferBytes + bytes > MAX_BATCH_BYTES) await flush();
        buffer.push(input);
        bufferBytes += bytes;
      }
    }

    if (isRecord(provider)) delete provider.models;
  }
  await flush();

  const stale = snapshot
    .filter((entry) => !keep.has(identity(entry.modelsDevProviderId, entry.modelsDevModelId)))
    .map((entry) => entry.modelId);
  const existing = snapshot.length;

  let removalSkipped = false;
  if (stale.length > 0) {
    if (!opts.force && stale.length > existing * REMOVAL_GUARD_FRACTION) {
      removalSkipped = true;
    } else {
      for (let i = 0; i < stale.length; i += CHUNK_SIZE) {
        const result = await ctx.runMutation(internal.sync.removeModels, {
          runId: opts.runId,
          modelIds: stale.slice(i, i + CHUNK_SIZE),
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
      if (!keepProviders.has(entry.modelsDevProviderId)) staleProviders.push(entry.providerId);
    }
    if (page.isDone) break;
    providerCursor = page.continueCursor;
  }
  if (staleProviders.length > 0 && !removalSkipped) {
    for (let i = 0; i < staleProviders.length; i += CHUNK_SIZE) {
      const result = await ctx.runMutation(internal.sync.removeProviders, {
        runId: opts.runId,
        providerIds: staleProviders.slice(i, i + CHUNK_SIZE),
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
  if (!begin.proceed) return { status: "skipped", reason: begin.reason, errors: [] };

  const { config, state, isFirstSync } = begin;
  const urls = [...new Set([config.sourceUrl, FALLBACK_SOURCE_URL])];
  const errors: SyncSourceError[] = [];
  let activeSource: SyncSourceError["source"] = "primary";
  try {
    let loaded: Loaded | undefined;
    for (const [index, url] of urls.entries()) {
      activeSource = index === 0 ? "primary" : "fallback";
      try {
        loaded = await loadCatalog(url, state, config);
        break;
      } catch (error) {
        errors.push({ source: activeSource, ...failureData(error, "MODELS_DEV_NETWORK_ERROR") });
      }
    }
    if (!loaded) {
      const failure = errors[0] ?? modelsDevError("MODELS_DEV_PROVIDER_ERROR").data;
      throw modelsDevError(failure.code, failure);
    }

    if (loaded.kind === "not_modified") {
      const durationMs = Date.now() - started;
      const recorded = await ctx.runMutation(internal.sync.finish, {
        runId,
        status: "not_modified",
        errors,
        source: loaded.url,
        ...(loaded.etag && { etag: loaded.etag }),
        ...(loaded.contentHash && { contentHash: loaded.contentHash }),
        durationMs,
      });
      if (!recorded) throw new LeaseLost();
      return { status: "not_modified", source: loaded.url, durationMs, errors };
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

    const status = stats.removalSkipped ? "partial" : "ok";
    const recorded = await ctx.runMutation(internal.sync.finish, {
      runId,
      status,
      errors,
      source: loaded.url,
      ...(loaded.etag && { etag: loaded.etag }),
      contentHash: loaded.contentHash,
      stats: finalStats,
      durationMs,
    });
    if (!recorded) throw new LeaseLost();
    return { status, source: loaded.url, ...finalStats, durationMs, errors };
  } catch (error) {
    if (error instanceof LeaseLost) {
      return {
        status: "error",
        errors: [
          ...errors,
          { source: activeSource, ...modelsDevError("MODELS_DEV_LEASE_LOST").data },
        ],
        durationMs: Date.now() - started,
      };
    }
    const data = failureData(error, "MODELS_DEV_SYNC_FAILED");
    if (!errors.some((entry) => entry.source === activeSource))
      errors.push({ source: activeSource, ...data });
    await ctx.runMutation(internal.sync.finish, {
      runId,
      status: "error",
      errors,
      durationMs: Date.now() - started,
    });
    return { status: "error", errors, durationMs: Date.now() - started };
  }
}
