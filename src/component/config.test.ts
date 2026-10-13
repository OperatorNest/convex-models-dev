import { expect, test } from "vitest";

import { api } from "./_generated/api.js";
import { expectModelsDevError, setupTest } from "../test-helpers.js";

test("source URLs larger than 2048 UTF-8 bytes are rejected", async () => {
  const t = setupTest();
  await expectModelsDevError(
    t.mutation(api.config.update, { sourceUrl: "https://example.com/" + "a".repeat(2048) }),
    "MODELS_DEV_INVALID_ARGUMENT",
  );
});

test.each([
  "https://example.com/api.json?token=x",
  "https://example.com/api.json?",
  "https://example.com/api.json#token",
])(
  "source URL %s with a query or fragment is rejected and the setting is kept",
  async (sourceUrl) => {
    const t = setupTest();
    await expectModelsDevError(
      t.mutation(api.config.update, { sourceUrl }),
      "MODELS_DEV_INVALID_ARGUMENT",
    );
    expect(await t.query(api.config.get, {})).toMatchObject({
      sourceUrl: "https://models.dev/api.json",
    });
  },
);
