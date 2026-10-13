import { ConvexError, v } from "convex/values";

export const MODELS_DEV_ERROR_CODES = [
  "MODELS_DEV_INVALID_CONFIG",
  "MODELS_DEV_INVALID_SOURCE_URL",
  "MODELS_DEV_INVALID_ARGUMENT",
  "MODELS_DEV_INVALID_CATALOG",
  "MODELS_DEV_CATALOG_TOO_SMALL",
  "MODELS_DEV_CATALOG_TOO_LARGE",
  "MODELS_DEV_FETCH_FAILED",
  "MODELS_DEV_SYNC_FAILED",
  "MODELS_DEV_LEASE_LOST",
] as const;
export type ModelsDevErrorCode = (typeof MODELS_DEV_ERROR_CODES)[number];
export type ModelsDevErrorData = {
  code: ModelsDevErrorCode;
  message: string;
  providerStatus?: number;
};

const MODELS_DEV_ERROR_MESSAGES = {
  MODELS_DEV_INVALID_CONFIG: "A configuration value is nonfinite or below its minimum.",
  MODELS_DEV_INVALID_SOURCE_URL:
    "The source URL must use HTTPS, omit credentials and fit in 2048 UTF-8 bytes.",
  MODELS_DEV_INVALID_ARGUMENT: "An argument is malformed or outside its bounds.",
  MODELS_DEV_INVALID_CATALOG: "The catalog is malformed.",
  MODELS_DEV_CATALOG_TOO_SMALL: "The catalog has fewer usable providers or models than configured.",
  MODELS_DEV_CATALOG_TOO_LARGE: "The catalog exceeds 16 MiB.",
  MODELS_DEV_FETCH_FAILED: "The catalog request failed.",
  MODELS_DEV_SYNC_FAILED: "The catalog write failed.",
  MODELS_DEV_LEASE_LOST: "The sync run no longer owns its lease.",
} as const satisfies Record<ModelsDevErrorCode, string>;

export const modelsDevErrorValidator = v.object({
  code: v.union(...MODELS_DEV_ERROR_CODES.map((code) => v.literal(code))),
  message: v.string(),
  providerStatus: v.optional(v.number()),
});

export function modelsDevError(
  code: ModelsDevErrorCode,
  providerStatus?: number,
): ConvexError<ModelsDevErrorData> {
  return new ConvexError({
    code,
    message: MODELS_DEV_ERROR_MESSAGES[code],
    ...(providerStatus !== undefined && { providerStatus }),
  });
}
export function isModelsDevError(error: unknown): error is ConvexError<ModelsDevErrorData> {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    Object.keys(data).every((key) => ["code", "message", "providerStatus"].includes(key)) &&
    "code" in data &&
    MODELS_DEV_ERROR_CODES.some((code) => code === data.code) &&
    "message" in data &&
    typeof data.message === "string" &&
    (!("providerStatus" in data) ||
      (typeof data.providerStatus === "number" &&
        Number.isInteger(data.providerStatus) &&
        data.providerStatus >= 100 &&
        data.providerStatus <= 599))
  );
}
