import type { ModelProviderConfig } from "../config/types.models.js";

/**
 * Provider tier classification for intelligent model routing.
 * Lower tier numbers indicate lower cost and higher priority.
 */
export enum ProviderTier {
  /** Local providers (vLLM, Ollama) - localhost/127.0.0.1 URLs */
  LOCAL = 0,
  /** Free tier providers (Xiaomi, Moonshot, Qianfan) - zero cost */
  FREE_TIER = 1,
  /** Low cost providers (MiniMax, Huggingface) - < $0.10/1M tokens */
  LOW_COST = 2,
  /** Medium cost providers - $0.10-0.50/1M tokens */
  MEDIUM_COST = 3,
  /** High cost providers (Anthropic, OpenAI) - > $0.50/1M tokens */
  HIGH_COST = 4,
}

/**
 * Check if a baseUrl indicates a local provider.
 * Matches localhost, 127.0.0.1, ::1, and private IP ranges (192.168.x.x, 10.x.x.x).
 */
export function isLocalProvider(baseUrl: string | undefined): boolean {
  if (!baseUrl) {
    return false;
  }
  const url = baseUrl.toLowerCase();
  return (
    url.includes("127.0.0.1") ||
    url.includes("localhost") ||
    url.includes("::1") ||
    /192\.168\.\d+\.\d+/.test(url) ||
    /10\.\d+\.\d+\.\d+/.test(url)
  );
}

/**
 * Calculate average cost per 1M tokens for a provider.
 * Returns average of (input + output) costs across all models.
 */
export function calculateProviderCost(config: ModelProviderConfig): number {
  if (config.models.length === 0) {
    return 0;
  }

  const totalCost = config.models.reduce((sum, model) => {
    const avgModelCost = (model.cost.input + model.cost.output) / 2;
    return sum + avgModelCost;
  }, 0);

  return totalCost / config.models.length;
}

/**
 * Classify a provider into a cost tier based on its configuration.
 * LOCAL tier: localhost/127.0.0.1 URLs
 * FREE_TIER: All models have zero cost
 * LOW_COST: Average cost < $0.10/1M tokens
 * MEDIUM_COST: Average cost $0.10-0.50/1M tokens
 * HIGH_COST: Average cost > $0.50/1M tokens
 */
export function classifyProviderTier(config: ModelProviderConfig): ProviderTier {
  // Check for local provider first
  if (isLocalProvider(config.baseUrl)) {
    return ProviderTier.LOCAL;
  }

  // Check if all models are free
  const allFree = config.models.every(
    (m) =>
      m.cost.input === 0 &&
      m.cost.output === 0 &&
      m.cost.cacheRead === 0 &&
      m.cost.cacheWrite === 0,
  );
  if (allFree) {
    return ProviderTier.FREE_TIER;
  }

  // Calculate average cost and classify
  const avgCost = calculateProviderCost(config);
  if (avgCost < 10) {
    return ProviderTier.LOW_COST;
  }
  if (avgCost < 50) {
    return ProviderTier.MEDIUM_COST;
  }
  return ProviderTier.HIGH_COST;
}
