import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { isModelsDevError, modelsDevError, MODELS_DEV_ERROR_CODES } from "./errors.js";

test("each error code has one fixed message", () => {
  for (const code of MODELS_DEV_ERROR_CODES) {
    const error =
      code === "MODELS_DEV_PROVIDER_ERROR" || code === "MODELS_DEV_NETWORK_ERROR"
        ? modelsDevError(code, { retryable: false })
        : modelsDevError(code);
    expect(isModelsDevError(error)).toBe(true);
    expect(error.data.message.endsWith(".")).toBe(true);
  }
});
test("error guards validate optional HTTP status and reject undeclared fields", () => {
  const data = modelsDevError("MODELS_DEV_PROVIDER_ERROR", {
    providerStatus: 503,
    retryable: true,
  }).data;
  expect(isModelsDevError(new ConvexError(data))).toBe(true);
  for (const providerStatus of [NaN, Infinity, 0, 600, 200.5, "503", null])
    expect(isModelsDevError(new ConvexError({ ...data, providerStatus }))).toBe(false);
  expect(isModelsDevError(new ConvexError({ ...data, message: "Caller text." }))).toBe(false);
  expect(isModelsDevError(new ConvexError({ code: data.code, message: data.message }))).toBe(false);
  expect(
    isModelsDevError(
      new ConvexError({ ...modelsDevError("MODELS_DEV_INVALID_ARGUMENT").data, retryable: true }),
    ),
  ).toBe(false);
});
