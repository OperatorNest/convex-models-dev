import { fixtureCatalog } from "./api.fixture.js";
import { normalizeModel } from "../shared/normalize.js";
import type { ModelRow } from "../shared/validators.js";

export { fixtureCatalog };

export type RawModel = { cost?: Record<string, unknown>; [key: string]: unknown };
export type Catalog = Record<string, { models: Record<string, RawModel>; [key: string]: unknown }>;

export function fixtureJson(mutate?: (catalog: Catalog) => void): string {
  const catalog = structuredClone(fixtureCatalog);
  mutate?.(catalog);
  return JSON.stringify(catalog);
}

/** One raw provider; throws when the fixture lacks it. */
export function providerOf(catalog: Catalog, providerId: string): Catalog[string] {
  const provider = catalog[providerId];
  if (!provider) throw new Error(`fixture provider ${providerId} missing`);
  return provider;
}

/** The raw models of one provider; throws when the fixture lacks the provider. */
export function modelsOf(catalog: Catalog, providerId: string): Record<string, RawModel> {
  return providerOf(catalog, providerId).models;
}

/** One raw model; throws when the fixture lacks it. */
export function rawModel(catalog: Catalog, providerId: string, modelId: string): RawModel {
  const model = modelsOf(catalog, providerId)[modelId];
  if (!model) throw new Error(`fixture model ${providerId}/${modelId} missing`);
  return model;
}

export function fixtureModel(providerId: string, modelId: string): ModelRow {
  const row = normalizeModel(providerId, modelId, rawModel(fixtureCatalog, providerId, modelId));
  if (!row) throw new Error(`fixture model ${providerId}/${modelId} invalid`);
  return row;
}

export const FIXTURE_MODEL_COUNT = Object.values(fixtureCatalog).reduce(
  (sum, provider) => sum + Object.keys(provider.models).length,
  0,
);
export const FIXTURE_PROVIDER_COUNT = Object.keys(fixtureCatalog).length;
