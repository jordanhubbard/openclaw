import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { ModelCatalogEntry } from "./model-catalog.js";
import { modelMeetsRequirements, resolveRequirementsFromConfig } from "./model-requirements.js";

describe("modelMeetsRequirements", () => {
  const baseModel: ModelCatalogEntry = {
    id: "test-model",
    name: "Test Model",
    provider: "test",
    contextWindow: 128000,
    reasoning: false,
    input: ["text"],
  };

  it("accepts model when no requirements specified", () => {
    expect(modelMeetsRequirements(baseModel, {})).toBe(true);
  });

  it("rejects model without reasoning when reasoning required", () => {
    expect(
      modelMeetsRequirements(baseModel, {
        reasoning: true,
      }),
    ).toBe(false);
  });

  it("accepts model with reasoning when reasoning required", () => {
    const reasoningModel: ModelCatalogEntry = {
      ...baseModel,
      reasoning: true,
    };
    expect(
      modelMeetsRequirements(reasoningModel, {
        reasoning: true,
      }),
    ).toBe(true);
  });

  it("accepts model with reasoning when reasoning not required", () => {
    const reasoningModel: ModelCatalogEntry = {
      ...baseModel,
      reasoning: true,
    };
    expect(
      modelMeetsRequirements(reasoningModel, {
        reasoning: false,
      }),
    ).toBe(true);
  });

  it("rejects model without vision when vision required", () => {
    expect(
      modelMeetsRequirements(baseModel, {
        vision: true,
      }),
    ).toBe(false);
  });

  it("accepts model with vision when vision required", () => {
    const visionModel: ModelCatalogEntry = {
      ...baseModel,
      input: ["text", "image"],
    };
    expect(
      modelMeetsRequirements(visionModel, {
        vision: true,
      }),
    ).toBe(true);
  });

  it("rejects model with insufficient context window", () => {
    expect(
      modelMeetsRequirements(baseModel, {
        minContextWindow: 200000,
      }),
    ).toBe(false);
  });

  it("accepts model with sufficient context window", () => {
    expect(
      modelMeetsRequirements(baseModel, {
        minContextWindow: 100000,
      }),
    ).toBe(true);
  });

  it("accepts model without context window if min not required", () => {
    const modelWithoutContext: ModelCatalogEntry = {
      ...baseModel,
      contextWindow: undefined,
    };
    expect(modelMeetsRequirements(modelWithoutContext, {})).toBe(true);
  });

  it("accepts model without context window if min is specified but model has no window", () => {
    const modelWithoutContext: ModelCatalogEntry = {
      ...baseModel,
      contextWindow: undefined,
    };
    // When contextWindow is undefined, we can't check the requirement, so we accept it
    expect(
      modelMeetsRequirements(modelWithoutContext, {
        minContextWindow: 100000,
      }),
    ).toBe(true);
  });

  it("handles multiple requirements", () => {
    const model: ModelCatalogEntry = {
      id: "advanced-model",
      name: "Advanced Model",
      provider: "test",
      contextWindow: 200000,
      reasoning: true,
      input: ["text", "image"],
    };

    expect(
      modelMeetsRequirements(model, {
        reasoning: true,
        vision: true,
        minContextWindow: 150000,
      }),
    ).toBe(true);

    expect(
      modelMeetsRequirements(baseModel, {
        reasoning: true,
        vision: true,
        minContextWindow: 150000,
      }),
    ).toBe(false);
  });
});

describe("resolveRequirementsFromConfig", () => {
  it("returns default requirements when config is undefined", () => {
    const requirements = resolveRequirementsFromConfig(undefined);
    expect(requirements).toEqual({
      reasoning: false,
      streaming: true,
      vision: false,
      minContextWindow: undefined,
    });
  });

  it("returns default requirements when routing not configured", () => {
    const cfg: OpenClawConfig = {};
    const requirements = resolveRequirementsFromConfig(cfg);
    expect(requirements).toEqual({
      reasoning: false,
      streaming: true,
      vision: false,
      minContextWindow: undefined,
    });
  });

  it("respects requireReasoning from config", () => {
    const cfg: OpenClawConfig = {
      models: {
        routing: {
          requireReasoning: true,
        },
      },
    };
    const requirements = resolveRequirementsFromConfig(cfg);
    expect(requirements.reasoning).toBe(true);
  });

  it("respects requireStreaming from config", () => {
    const cfg: OpenClawConfig = {
      models: {
        routing: {
          requireStreaming: false,
        },
      },
    };
    const requirements = resolveRequirementsFromConfig(cfg);
    expect(requirements.streaming).toBe(false);
  });

  it("uses defaults when routing enabled but fields not specified", () => {
    const cfg: OpenClawConfig = {
      models: {
        routing: {
          enabled: true,
        },
      },
    };
    const requirements = resolveRequirementsFromConfig(cfg);
    expect(requirements).toEqual({
      reasoning: false,
      streaming: true,
      vision: false,
      minContextWindow: undefined,
    });
  });
});
