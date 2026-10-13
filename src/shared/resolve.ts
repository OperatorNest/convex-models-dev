/** Maps AI SDK provider names to models.dev provider IDs where they differ. */
export const DEFAULT_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  gateway: "vercel",
  "google.generative-ai": "google",
  "google.vertex": "google-vertex",
  "vertex.anthropic": "google-vertex-anthropic",
  vertex: "google-vertex",
  bedrock: "amazon-bedrock",
  "azure-openai": "azure",
  fireworks: "fireworks-ai",
  together: "togetherai",
};

/** Lists catalog provider candidates for an aliased provider name. */
export function listProviderCandidates(
  provider: string,
  aliases: Record<string, string> = {},
): string[] {
  const table = { ...DEFAULT_PROVIDER_ALIASES, ...aliases };
  const full = provider.trim().toLowerCase();
  const stripped = full.split(".")[0] ?? full;
  const candidates = [
    table[full],
    table[`${stripped}.${full.split(".")[1] ?? ""}`],
    table[stripped],
    stripped,
    full,
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate !== "");
  return [...new Set(candidates)];
}

/** Resolves a provider name and model name into catalog identifiers. */
export function resolveModel(args: {
  provider: string;
  model: string;
  aliases?: Record<string, string>;
}): { modelsDevProviderId: string; modelsDevModelId: string } {
  const [modelsDevProviderId] = listProviderCandidates(args.provider, args.aliases);
  return {
    modelsDevProviderId: modelsDevProviderId ?? args.provider,
    modelsDevModelId: args.model,
  };
}

/** Splits a provider-qualified catalog model key at a known provider prefix. */
export function splitModelKey(
  key: string,
  isProvider: (modelsDevProviderId: string) => boolean,
): { modelsDevProviderId: string; modelsDevModelId: string } | null {
  for (let i = 0; i < key.length; i++) {
    const char = key[i];
    if (char !== "/" && char !== ":") continue;
    const modelsDevProviderId = key.slice(0, i);
    if (modelsDevProviderId && isProvider(modelsDevProviderId)) {
      const modelsDevModelId = key.slice(i + 1);
      return modelsDevModelId ? { modelsDevProviderId, modelsDevModelId } : null;
    }
  }
  return null;
}
