import { convexTest } from "convex-test";
import { vi } from "vitest";
import { api } from "./component/_generated/api.js";
import schema from "./component/schema.js";
import type { ImportMetaGlob } from "./import-meta.js";

const modules: ReturnType<ImportMetaGlob> = import.meta.glob([
  "./component/**/*.ts",
  "!./component/**/*.test.ts",
]);

/** A convex-test instance with the component's own schema as the root. */
export function componentTest() {
  return convexTest(schema, modules);
}
export type ComponentTest = ReturnType<typeof componentTest>;

/** The fixture is much smaller than the real catalog, so lower the abort guard. */
export async function relaxGuards(t: ComponentTest) {
  await t.mutation(api.config.configure, { minProviders: 1, minModels: 1 });
}

/** Narrows a nullable value or fails the test. */
export function requireValue<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

export type FetchCall = { url: string; headers: Record<string, string> };

/** Stubs global fetch with a handler and records each call. Never touches the network. */
export function stubFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
      });
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const call = { url, headers };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

/** A fake models.dev: serves `server.body` with an ETag and honours If-None-Match. */
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
    if (call.headers["if-none-match"] === server.etag) return new Response(null, { status: 304 });
    return new Response(server.body, { status: 200, headers: { etag: server.etag } });
  });
  return server;
}
