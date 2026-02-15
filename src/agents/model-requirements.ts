import type { OpenClawConfig } from "../config/config.js";
import type { ModelCatalogEntry } from "./model-catalog.js";

/**
 * Requirements that models must meet for intelligent routing.
 */
export interface ModelRequirements {
  /** Require reasoning capability (e.g., o1, o3, deepseek-r1) */
  reasoning?: boolean;
  /** Require streaming support (always true for interactive chat) */
  streaming?: boolean;
  /** Require vision/image input capability */
  vision?: boolean;
  /** Minimum context window size in tokens */
  minContextWindow?: number;
}

/**
 * Check if a model meets the specified requirements.
 * Returns true if all requirements are satisfied.
 */
export function modelMeetsRequirements(
  entry: ModelCatalogEntry,
  requirements: ModelRequirements,
): boolean {
  // Check reasoning requirement
  if (requirements.reasoning && !entry.reasoning) {
    return false;
  }

  // Check vision requirement
  if (requirements.vision && !entry.input?.includes("image")) {
    return false;
  }

  // Check context window requirement
  if (requirements.minContextWindow && entry.contextWindow) {
    if (entry.contextWindow < requirements.minContextWindow) {
      return false;
    }
  }

  // Note: We assume all models in the catalog support streaming.
  // If this becomes configurable, we'd check it here.

  return true;
}

/**
 * Resolve model requirements from OpenClaw configuration.
 * Returns the requirements that models must meet for intelligent routing.
 */
export function resolveRequirementsFromConfig(cfg: OpenClawConfig | undefined): ModelRequirements {
  const routing = cfg?.models?.routing;
  return {
    reasoning: routing?.requireReasoning ?? false,
    streaming: routing?.requireStreaming ?? true, // Always required for interactive chat
    vision: false, // Not a global requirement, checked per-request
    minContextWindow: undefined, // Can be added later if needed
  };
}
