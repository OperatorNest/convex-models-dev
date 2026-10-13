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

export function providerOf(catalog: Catalog, modelsDevProviderId: string): Catalog[string] {
  const provider = catalog[modelsDevProviderId];
  if (!provider) throw new Error(`fixture provider ${modelsDevProviderId} missing`);
  return provider;
}

export function modelsOf(catalog: Catalog, modelsDevProviderId: string): Record<string, RawModel> {
  return providerOf(catalog, modelsDevProviderId).models;
}

export function rawModel(
  catalog: Catalog,
  modelsDevProviderId: string,
  modelsDevModelId: string,
): RawModel {
  const model = modelsOf(catalog, modelsDevProviderId)[modelsDevModelId];
  if (!model) throw new Error(`fixture model ${modelsDevProviderId}/${modelsDevModelId} missing`);
  return model;
}

export function fixtureModel(modelsDevProviderId: string, modelsDevModelId: string): ModelRow {
  const row = normalizeModel(
    modelsDevProviderId,
    modelsDevModelId,
    rawModel(fixtureCatalog, modelsDevProviderId, modelsDevModelId),
  );
  if (!row) throw new Error(`fixture model ${modelsDevProviderId}/${modelsDevModelId} invalid`);
  return row;
}

export const FIXTURE_MODEL_COUNT = Object.values(fixtureCatalog).reduce(
  (sum, provider) => sum + Object.keys(provider.models).length,
  0,
);
export const FIXTURE_PROVIDER_COUNT = Object.keys(fixtureCatalog).length;
