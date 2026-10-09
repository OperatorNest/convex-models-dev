import { ConvexError } from "convex/values";

export const MODELS_DEV_ERROR_CODES = [
  "MODELS_DEV_INVALID_CONFIG",
  "MODELS_DEV_INVALID_SOURCE_URL",
  "MODELS_DEV_INVALID_CATALOG",
] as const;

export type ModelsDevErrorCode = (typeof MODELS_DEV_ERROR_CODES)[number];

export type ModelsDevErrorData = {
  code: ModelsDevErrorCode;
  message: string;
  retryable?: boolean;
};

/** The only way this component raises an error a caller can see. */
export function modelsDevError(
  code: ModelsDevErrorCode,
  message: string,
  retryable?: boolean,
): ConvexError<ModelsDevErrorData> {
  return new ConvexError<ModelsDevErrorData>({
    code,
    message,
    ...(retryable !== undefined && { retryable }),
  });
}
