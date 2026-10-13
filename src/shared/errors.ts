import { ConvexError } from "convex/values";

export const MODELS_DEV_ERROR_CODES = [
  "MODELS_DEV_INVALID_ARGUMENT",
  "MODELS_DEV_PROVIDER_ERROR",
  "MODELS_DEV_NETWORK_ERROR",
  "MODELS_DEV_INVALID_RESPONSE",
  "MODELS_DEV_CATALOG_TOO_SMALL",
  "MODELS_DEV_CATALOG_TOO_LARGE",
  "MODELS_DEV_SYNC_FAILED",
  "MODELS_DEV_LEASE_LOST",
] as const;
/** Identifies the caller action required after a catalog operation fails. */
export type ModelsDevErrorCode = (typeof MODELS_DEV_ERROR_CODES)[number];
/** Describes a catalog failure without exposing provider response content. */
export type ModelsDevErrorData = {
  code: ModelsDevErrorCode;
  message: string;
  retryable?: boolean;
  providerStatus?: number;
  providerCode?: string;
};

const MODELS_DEV_ERROR_MESSAGES = {
  MODELS_DEV_INVALID_ARGUMENT: "An argument is malformed or outside its bounds.",
  MODELS_DEV_PROVIDER_ERROR: "The catalog provider returned a failure response.",
  MODELS_DEV_NETWORK_ERROR: "The catalog request produced no response.",
  MODELS_DEV_INVALID_RESPONSE: "The catalog response is malformed.",
  MODELS_DEV_CATALOG_TOO_SMALL: "The catalog has fewer usable providers or models than configured.",
  MODELS_DEV_CATALOG_TOO_LARGE: "The catalog exceeds 16 MiB.",
  MODELS_DEV_SYNC_FAILED: "The catalog write failed.",
  MODELS_DEV_LEASE_LOST: "The sync run no longer owns its lease.",
} as const satisfies Record<ModelsDevErrorCode, string>;

export function modelsDevError(
  code: ModelsDevErrorCode,
  details?: { providerStatus?: number; providerCode?: string; retryable?: boolean },
): ConvexError<ModelsDevErrorData> {
  const providerFailure =
    code === "MODELS_DEV_PROVIDER_ERROR" || code === "MODELS_DEV_NETWORK_ERROR";
  return new ConvexError({
    code,
    message: MODELS_DEV_ERROR_MESSAGES[code],
    ...(providerFailure && {
      retryable: details?.retryable ?? code === "MODELS_DEV_NETWORK_ERROR",
    }),
    ...(details?.providerStatus !== undefined && { providerStatus: details.providerStatus }),
    ...(details?.providerCode !== undefined && { providerCode: details.providerCode.slice(0, 64) }),
  });
}
/** Recognizes catalog errors with the fixed message and valid provider diagnostics. */
export function isModelsDevError(error: unknown): error is ConvexError<ModelsDevErrorData> {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return false;
  const code = MODELS_DEV_ERROR_CODES.find((candidate) => candidate === data.code);
  if (!code || !("message" in data) || data.message !== MODELS_DEV_ERROR_MESSAGES[code])
    return false;
  return (
    Object.keys(data).every((key) =>
      ["code", "message", "retryable", "providerStatus", "providerCode"].includes(key),
    ) &&
    (!("retryable" in data) ||
      ((code === "MODELS_DEV_PROVIDER_ERROR" || code === "MODELS_DEV_NETWORK_ERROR") &&
        typeof data.retryable === "boolean")) &&
    (!("providerCode" in data) ||
      (typeof data.providerCode === "string" && data.providerCode.length <= 64)) &&
    (!("providerStatus" in data) ||
      (typeof data.providerStatus === "number" &&
        Number.isInteger(data.providerStatus) &&
        data.providerStatus >= 100 &&
        data.providerStatus <= 599))
  );
}
