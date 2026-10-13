import { ConvexError } from "convex/values";
import { truncateText } from "./bounds.js";

// repository-codes:begin
/** Lists every error code this component throws or records. */
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

const MODELS_DEV_PROVIDER_ERROR_CODES = [
  "MODELS_DEV_PROVIDER_ERROR",
  "MODELS_DEV_NETWORK_ERROR",
] as const satisfies readonly ModelsDevErrorCode[];

const MODELS_DEV_ERROR_MESSAGES = {
  MODELS_DEV_INVALID_ARGUMENT: "An argument is malformed or outside its bounds.",
  MODELS_DEV_PROVIDER_ERROR: "The catalog provider returned a failure response.",
  MODELS_DEV_NETWORK_ERROR: "The catalog request or body read failed.",
  MODELS_DEV_INVALID_RESPONSE: "The catalog response is malformed.",
  MODELS_DEV_CATALOG_TOO_SMALL: "The catalog has fewer usable providers or models than configured.",
  MODELS_DEV_CATALOG_TOO_LARGE: "The catalog exceeds 8 MiB.",
  MODELS_DEV_SYNC_FAILED: "The catalog sync failed.",
  MODELS_DEV_LEASE_LOST: "The sync run no longer owns its lease.",
} as const satisfies Record<ModelsDevErrorCode, string>;
// repository-codes:end

const ERROR_DATA_KEYS: ReadonlySet<string> = new Set([
  "code",
  "message",
  "retryable",
  "providerStatus",
  "providerCode",
]);

/** One fixed caller-visible failure; `MODELS_DEV_ERROR_CODES` lists every code. */
export type ModelsDevErrorCode = (typeof MODELS_DEV_ERROR_CODES)[number];

/** Error data: the code, its fixed message and bounded provider failure details. `retryable` is present exactly on provider-originated codes. */
export type ModelsDevErrorData = {
  code: ModelsDevErrorCode;
  message: string;
  retryable?: boolean;
  providerStatus?: number;
  providerCode?: string;
};

type ProviderErrorCode = (typeof MODELS_DEV_PROVIDER_ERROR_CODES)[number];

type ErrorDetails<Code extends ModelsDevErrorCode> = [Code] extends [
  Exclude<ModelsDevErrorCode, ProviderErrorCode>,
]
  ? [details?: { retryable?: never; providerStatus?: number; providerCode?: string }]
  : [details: { retryable: boolean; providerStatus?: number; providerCode?: string }];

function isProviderErrorCode(code: unknown): code is ProviderErrorCode {
  return MODELS_DEV_PROVIDER_ERROR_CODES.some((candidate) => candidate === code);
}

/** Creates the error for `code` with its fixed message. Provider-originated codes require `details.retryable`; other codes forbid it. `providerCode` is truncated to 64 characters. */
export function modelsDevError<Code extends ModelsDevErrorCode>(
  code: Code,
  ...[details]: ErrorDetails<Code>
): ConvexError<ModelsDevErrorData> {
  return new ConvexError({
    code,
    message: MODELS_DEV_ERROR_MESSAGES[code],
    ...(isProviderErrorCode(code) &&
      details?.retryable !== undefined && { retryable: details.retryable }),
    ...(details?.providerStatus !== undefined && { providerStatus: details.providerStatus }),
    ...(details?.providerCode !== undefined && {
      providerCode: truncateText(details.providerCode, 64),
    }),
  });
}

/** Returns true when `error` carries exactly a known code, its fixed message, `retryable` on provider-originated codes only, and well-formed provider details. */
export function isModelsDevError(error: unknown): error is ConvexError<ModelsDevErrorData> {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("code" in data) || !("message" in data))
    return false;
  const { code, message } = data;
  return (
    Object.keys(data).every((key) => ERROR_DATA_KEYS.has(key)) &&
    MODELS_DEV_ERROR_CODES.some(
      (candidate) => candidate === code && message === MODELS_DEV_ERROR_MESSAGES[candidate],
    ) &&
    ("retryable" in data
      ? isProviderErrorCode(code) && typeof data.retryable === "boolean"
      : !isProviderErrorCode(code)) &&
    (!("providerStatus" in data) ||
      (typeof data.providerStatus === "number" &&
        Number.isInteger(data.providerStatus) &&
        data.providerStatus >= 100 &&
        data.providerStatus <= 599)) &&
    (!("providerCode" in data) ||
      (typeof data.providerCode === "string" &&
        data.providerCode.isWellFormed() &&
        data.providerCode.length <= 64))
  );
}
