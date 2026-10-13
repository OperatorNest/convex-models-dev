import { test } from "vitest";

import { api } from "./_generated/api.js";
import { expectModelsDevError, setupTest } from "../test-helpers.js";

test("source URLs larger than 2048 UTF-8 bytes are rejected", async () => {
  const t = setupTest();
  await expectModelsDevError(
    t.mutation(api.config.update, { sourceUrl: "https://example.com/" + "a".repeat(2048) }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
});
