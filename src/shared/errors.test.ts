import { expect, test } from "vitest";
import { modelsDevError } from "./errors.js";

test("builds a ConvexError with a code and message, and omits retryable by default", () => {
  const error = modelsDevError("MODELS_DEV_INVALID_CONFIG", "bad");
  expect(error.data).toEqual({ code: "MODELS_DEV_INVALID_CONFIG", message: "bad" });
});

test("carries retryable when given", () => {
  const error = modelsDevError("MODELS_DEV_INVALID_CONFIG", "bad", false);
  expect(error.data).toEqual({
    code: "MODELS_DEV_INVALID_CONFIG",
    message: "bad",
    retryable: false,
  });
});
