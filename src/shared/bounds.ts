import type { PaginationOptions } from "convex/server";
import { jsonToConvex } from "convex/values";
import { modelsDevError } from "./errors.js";

export function finiteBounds(...values: (number | undefined)[]): void {
  if (values.some((value) => value !== undefined && (!Number.isFinite(value) || value < 0)))
    throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
}
export function boundedLimit(value: number | undefined, fallback: number, max: number): number {
  finiteBounds(value);
  return Math.max(1, Math.min(Math.floor(value ?? fallback), max));
}
export function boundedPage(options: PaginationOptions): PaginationOptions {
  if (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > 100)
    throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
  finiteBounds(options.maximumRowsRead, options.maximumBytesRead);
  for (const cursor of [options.cursor, options.endCursor]) {
    if (cursor === null || cursor === undefined) continue;
    try {
      if (cursor.length > 16384 || !wellFormed(cursor))
        throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
      const key = jsonToConvex(JSON.parse(cursor));
      if (
        !Array.isArray(key) ||
        key.length > 16 ||
        key.some(
          (value) =>
            value !== null &&
            typeof value !== "string" &&
            typeof value !== "number" &&
            typeof value !== "boolean" &&
            typeof value !== "bigint" &&
            !(value instanceof ArrayBuffer),
        )
      )
        throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
    } catch {
      throw modelsDevError("MODELS_DEV_INVALID_ARGUMENT");
    }
  }
  return {
    numItems: options.numItems,
    cursor: options.cursor,
    endCursor: options.endCursor,
    maximumRowsRead: boundedLimit(
      options.maximumRowsRead,
      options.numItems + 1,
      options.numItems + 1,
    ),
    maximumBytesRead: boundedLimit(options.maximumBytesRead, 1024 * 1024, 1024 * 1024),
  };
}
export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
export function jsonBytes(value: unknown): number {
  return utf8Bytes(JSON.stringify(value));
}

export function wellFormed(value: string): boolean {
  return !/[\uD800-\uDFFF]/u.test(value);
}
