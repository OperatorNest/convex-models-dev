/**
 * AI SDK `LanguageModel.provider` strings (for example "anthropic.messages" or
 * "google.vertex.chat") are not models.dev provider ids. These aliases cover
 * the common mismatches; pass `aliases` to extend or override them.
 */
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

/** Candidate models.dev provider ids for an AI SDK provider string, best first. */
export function providerCandidates(
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

/**
 * Maps an AI SDK / Agent `{ provider, model }` pair to a models.dev
 * `{ providerId, modelId }`. Pure and best effort: the component's
 * `models.resolve` additionally checks candidates against the catalog.
 */
export function resolveModel(args: {
  provider: string;
  model: string;
  aliases?: Record<string, string>;
}): { providerId: string; modelId: string } {
  const [providerId] = providerCandidates(args.provider, args.aliases);
  return { providerId: providerId ?? args.provider, modelId: args.model };
}

/**
 * Splits "provider/model" or "provider:model" at the first separator whose left
 * side is a known provider id. Model ids themselves contain "/" and ":".
 */
export function splitModelKey(
  key: string,
  isProvider: (providerId: string) => boolean,
): { providerId: string; modelId: string } | null {
  for (let i = 0; i < key.length; i++) {
    const char = key[i];
    if (char !== "/" && char !== ":") continue;
    const providerId = key.slice(0, i);
    if (providerId && isProvider(providerId)) {
      const modelId = key.slice(i + 1);
      return modelId ? { providerId, modelId } : null;
    }
  }
  return null;
}
