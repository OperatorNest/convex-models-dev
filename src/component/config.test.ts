import { expect, test } from "vitest";

import { api } from "./_generated/api.js";
import { componentTest } from "../test-helpers.js";

test("source URLs larger than 2048 UTF-8 bytes are rejected", async () => {
  const t = componentTest();
  await expect(
    t.mutation(api.config.update, { sourceUrl: "https://example.com/" + "a".repeat(2048) }),
  ).rejects.toMatchObject({ data: { code: "MODELS_DEV_INVALID_ARGUMENT" } });
});
