import { describe, expect, it } from "vitest";
import type { ModelProviderConfig } from "../config/types.models.js";
import type { ModelCatalogEntry } from "./model-catalog.js";
import { describeTier, scoreModel } from "./model-scoring.js";
import { ProviderTier } from "./model-tiers.js";

describe("scoreModel", () => {
  const localProviderConfig: ModelProviderConfig = {
    baseUrl: "http://127.0.0.1:8000/v1",
    models: [
      {
        id: "local-model",
        name: "Local Model",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  };

  const freeTierProviderConfig: ModelProviderConfig = {
    baseUrl: "https://api.free.com/v1",
    models: [
      {
        id: "free-model",
        name: "Free Model",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  };

  const lowCostProviderConfig: ModelProviderConfig = {
    baseUrl: "https://api.lowcost.com/v1",
    models: [
      {
        id: "cheap-model",
        name: "Cheap Model",
        reasoning: false,
        input: ["text"],
        cost: { input: 5, output: 8, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  };

  const highCostProviderConfig: ModelProviderConfig = {
    baseUrl: "https://api.expensive.com/v1",
    models: [
      {
        id: "expensive-model",
        name: "Expensive Model",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 150, output: 750, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      },
    ],
  };

  it("gives highest score to local provider with reasoning", () => {
    const entry: ModelCatalogEntry = {
      id: "local-model",
      name: "Local Model",
      provider: "vllm",
      contextWindow: 128000,
      reasoning: true,
      input: ["text"],
    };

    const score = scoreModel(entry, localProviderConfig, {});

    expect(score.meetsRequirements).toBe(true);
    expect(score.tier).toBe(ProviderTier.LOCAL);
    // Score = (4-0)*1000 - 0 + 50 (reasoning) + 100 (local) = 4150
    expect(score.score).toBe(4150);
  });

  it("gives high score to free tier provider", () => {
    const entry: ModelCatalogEntry = {
      id: "free-model",
      name: "Free Model",
      provider: "moonshot",
      contextWindow: 128000,
      reasoning: false,
      input: ["text"],
    };

    const score = scoreModel(entry, freeTierProviderConfig, {});

    expect(score.meetsRequirements).toBe(true);
    expect(score.tier).toBe(ProviderTier.FREE_TIER);
    // Score = (4-1)*1000 - 0 = 3000
    expect(score.score).toBe(3000);
  });

  it("applies cost penalty within tier", () => {
    const entry: ModelCatalogEntry = {
      id: "cheap-model",
      name: "Cheap Model",
      provider: "minimax",
      contextWindow: 128000,
      reasoning: false,
      input: ["text"],
    };

    const score = scoreModel(entry, lowCostProviderConfig, {});

    expect(score.meetsRequirements).toBe(true);
    expect(score.tier).toBe(ProviderTier.LOW_COST);
    // Score = (4-2)*1000 - 6.5 = 2000 - 6.5 = 1993.5
    expect(score.score).toBeCloseTo(1993.5);
  });

  it("adds reasoning bonus to high cost provider", () => {
    const entry: ModelCatalogEntry = {
      id: "expensive-model",
      name: "Expensive Model",
      provider: "anthropic",
      contextWindow: 200000,
      reasoning: true,
      input: ["text", "image"],
    };

    const score = scoreModel(entry, highCostProviderConfig, {});

    expect(score.meetsRequirements).toBe(true);
    expect(score.tier).toBe(ProviderTier.HIGH_COST);
    // Score = (4-4)*1000 - 450 + 50 (reasoning) = -400
    expect(score.score).toBe(-400);
  });

  it("returns score -1 when requirements not met", () => {
    const entry: ModelCatalogEntry = {
      id: "non-reasoning-model",
      name: "Non-Reasoning Model",
      provider: "test",
      contextWindow: 128000,
      reasoning: false,
      input: ["text"],
    };

    const score = scoreModel(entry, freeTierProviderConfig, {
      reasoning: true,
    });

    expect(score.meetsRequirements).toBe(false);
    expect(score.score).toBe(-1);
    expect(score.cost).toBe(999999);
  });

  it("filters out models without vision when vision required", () => {
    const entry: ModelCatalogEntry = {
      id: "text-only-model",
      name: "Text Only Model",
      provider: "test",
      contextWindow: 128000,
      reasoning: false,
      input: ["text"],
    };

    const score = scoreModel(entry, freeTierProviderConfig, {
      vision: true,
    });

    expect(score.meetsRequirements).toBe(false);
    expect(score.score).toBe(-1);
  });

  it("handles model not in provider config", () => {
    const entry: ModelCatalogEntry = {
      id: "unknown-model",
      name: "Unknown Model",
      provider: "test",
      contextWindow: 128000,
      reasoning: false,
      input: ["text"],
    };

    const score = scoreModel(entry, freeTierProviderConfig, {});

    // Model not in config, so cost defaults to 0
    expect(score.meetsRequirements).toBe(true);
    expect(score.cost).toBe(0);
  });

  it("ranks models in expected order", () => {
    const models: Array<{ entry: ModelCatalogEntry; config: ModelProviderConfig }> = [
      {
        entry: {
          id: "local-model",
          name: "Local",
          provider: "vllm",
          reasoning: true,
          input: ["text"],
        },
        config: localProviderConfig,
      },
      {
        entry: {
          id: "free-model",
          name: "Free",
          provider: "moonshot",
          reasoning: false,
          input: ["text"],
        },
        config: freeTierProviderConfig,
      },
      {
        entry: {
          id: "cheap-model",
          name: "Cheap",
          provider: "minimax",
          reasoning: false,
          input: ["text"],
        },
        config: lowCostProviderConfig,
      },
      {
        entry: {
          id: "expensive-model",
          name: "Expensive",
          provider: "anthropic",
          reasoning: true,
          input: ["text", "image"],
        },
        config: highCostProviderConfig,
      },
    ];

    const scores = models.map(({ entry, config }) => scoreModel(entry, config, {}));

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    // Expected order: local > free > low-cost > high-cost
    expect(scores[0].model).toBe("local-model");
    expect(scores[1].model).toBe("free-model");
    expect(scores[2].model).toBe("cheap-model");
    expect(scores[3].model).toBe("expensive-model");
  });
});

describe("describeTier", () => {
  it("describes all tiers correctly", () => {
    expect(describeTier(ProviderTier.LOCAL)).toBe("LOCAL");
    expect(describeTier(ProviderTier.FREE_TIER)).toBe("FREE_TIER");
    expect(describeTier(ProviderTier.LOW_COST)).toBe("LOW_COST");
    expect(describeTier(ProviderTier.MEDIUM_COST)).toBe("MEDIUM_COST");
    expect(describeTier(ProviderTier.HIGH_COST)).toBe("HIGH_COST");
  });

  it("handles unknown tier", () => {
    expect(describeTier(999 as ProviderTier)).toBe("UNKNOWN");
  });
});
