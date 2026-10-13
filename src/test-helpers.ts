import { convexTest } from "convex-test";
import { expect, vi } from "vitest";
import { api } from "./component/_generated/api.js";
import schema from "./component/schema.js";
import { isModelsDevError, type ModelsDevErrorCode } from "./shared/errors.js";

// shared-block:begin
type GlobImportMeta = ImportMeta & {
  glob: (patterns: string[]) => Record<string, () => Promise<unknown>>;
};
const modules = (import.meta as GlobImportMeta).glob([
  "./component/**/*.ts",
  "!./component/**/*.test.ts",
]);

export function setupTest() {
  const t = convexTest(schema, modules);
  return t;
}

export type TestCtx = ReturnType<typeof setupTest>;

export async function drain(t: Pick<TestCtx, "finishAllScheduledFunctions">): Promise<void> {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to exist`);
  return value;
}

export type FetchCall = { url: string; init: RequestInit };

export function stubFetch(
  respond: (call: FetchCall, index: number) => Response | Promise<Response>,
): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: input instanceof Request ? input.url : String(input), init };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  return calls;
}

export async function expectModelsDevError(
  promise: Promise<unknown>,
  code: ModelsDevErrorCode,
): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(isModelsDevError(error), String(error)).toBe(true);
  if (isModelsDevError(error)) expect(error.data.code).toBe(code);
}
// shared-block:end

export async function relaxGuards(t: TestCtx) {
  await t.mutation(api.config.update, { minProviders: 1, minModels: 1 });
}

export function catalogServer(initial: { body: string; etag?: string }) {
  const server = {
    body: initial.body,
    etag: initial.etag ?? '"etag-1"',
    failPrimary: false,
    failAll: false,
    calls: [] as FetchCall[],
  };
  server.calls = stubFetch((call) => {
    if (server.failAll) return new Response("down", { status: 503 });
    if (server.failPrimary && call.url.startsWith("https://models.dev/")) {
      return new Response("boom", { status: 500 });
    }
    if (new Headers(call.init.headers).get("if-none-match") === server.etag)
      return new Response(null, { status: 304 });
    return new Response(server.body, { status: 200, headers: { etag: server.etag } });
  });
  return server;
}
