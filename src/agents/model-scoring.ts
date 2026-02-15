import type { ModelProviderConfig } from "../config/types.models.js";
import type { ModelCatalogEntry } from "./model-catalog.js";
import type { ModelRequirements } from "./model-requirements.js";
import { modelMeetsRequirements } from "./model-requirements.js";
import { ProviderTier, classifyProviderTier } from "./model-tiers.js";

/**
 * Scoring result for a model candidate.
 */
export interface ModelScore {
  provider: string;
  model: string;
  score: number;
  tier: ProviderTier;
  meetsRequirements: boolean;
  cost: number;
}

/**
 * Score a model for intelligent routing.
 * Scoring algorithm:
 *   score = (4 - tier) × 1000       // Tier weight (4000 for LOCAL down to 0 for HIGH_COST)
 *         - averageCost             // Cost penalty within tier
 *         + (reasoning ? 50 : 0)    // Bonus for reasoning capability
 *         + (local ? 100 : 0)       // Extra bonus for local providers
 *
 * Models that don't meet requirements get score = -1 and meetsRequirements = false.
 */
export function scoreModel(
  entry: ModelCatalogEntry,
  providerConfig: ModelProviderConfig,
  requirements: ModelRequirements,
): ModelScore {
  // Check requirements first
  const meetsRequirements = modelMeetsRequirements(entry, requirements);
  if (!meetsRequirements) {
    return {
      provider: entry.provider,
      model: entry.id,
      score: -1,
      tier: ProviderTier.HIGH_COST,
      meetsRequirements: false,
      cost: 999999,
    };
  }

  // Calculate tier and base score
  const tier = classifyProviderTier(providerConfig);
  let score = (4 - tier) * 1000;

  // Find the specific model definition to get its cost
  const modelDef = providerConfig.models.find((m) => m.id === entry.id);
  const cost = modelDef ? (modelDef.cost.input + modelDef.cost.output) / 2 : 0;

  // Apply cost penalty within tier
  score -= cost;

  // Add bonuses
  if (entry.reasoning) {
    score += 50;
  }
  if (tier === ProviderTier.LOCAL) {
    score += 100;
  }

  return {
    provider: entry.provider,
    model: entry.id,
    score,
    tier,
    meetsRequirements: true,
    cost,
  };
}

/**
 * Get a human-readable description of a provider tier.
 */
export function describeTier(tier: ProviderTier): string {
  switch (tier) {
    case ProviderTier.LOCAL:
      return "LOCAL";
    case ProviderTier.FREE_TIER:
      return "FREE_TIER";
    case ProviderTier.LOW_COST:
      return "LOW_COST";
    case ProviderTier.MEDIUM_COST:
      return "MEDIUM_COST";
    case ProviderTier.HIGH_COST:
      return "HIGH_COST";
    default:
      return "UNKNOWN";
  }
}
