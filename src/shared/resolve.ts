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

export function resolveModel(args: {
  provider: string;
  model: string;
  aliases?: Record<string, string>;
}): { providerId: string; modelId: string } {
  const [providerId] = providerCandidates(args.provider, args.aliases);
  return { providerId: providerId ?? args.provider, modelId: args.model };
}

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
