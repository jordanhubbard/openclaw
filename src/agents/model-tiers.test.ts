import { describe, expect, it } from "vitest";
import type { ModelProviderConfig } from "../config/types.models.js";
import {
  ProviderTier,
  calculateProviderCost,
  classifyProviderTier,
  isLocalProvider,
} from "./model-tiers.js";

describe("isLocalProvider", () => {
  it("detects localhost URLs", () => {
    expect(isLocalProvider("http://localhost:8000")).toBe(true);
    expect(isLocalProvider("https://LOCALHOST:8080")).toBe(true);
  });

  it("detects 127.0.0.1", () => {
    expect(isLocalProvider("http://127.0.0.1:8000/v1")).toBe(true);
  });

  it("detects IPv6 localhost", () => {
    expect(isLocalProvider("http://[::1]:8000")).toBe(true);
  });

  it("detects private IP ranges", () => {
    expect(isLocalProvider("http://192.168.1.100:8000")).toBe(true);
    expect(isLocalProvider("http://10.0.0.5:8000")).toBe(true);
  });

  it("rejects remote URLs", () => {
    expect(isLocalProvider("https://api.anthropic.com")).toBe(false);
    expect(isLocalProvider("https://api.openai.com")).toBe(false);
  });

  it("handles undefined", () => {
    expect(isLocalProvider(undefined)).toBe(false);
  });
});

describe("calculateProviderCost", () => {
  it("calculates average cost across models", () => {
    const config: ModelProviderConfig = {
      baseUrl: "https://api.example.com",
      models: [
        {
          id: "model-1",
          name: "Model 1",
          reasoning: false,
          input: ["text"],
          cost: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        },
        {
          id: "model-2",
          name: "Model 2",
          reasoning: false,
          input: ["text"],
          cost: { input: 30, output: 40, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        },
      ],
    };

    // Average: ((10+20)/2 + (30+40)/2) / 2 = (15 + 35) / 2 = 25
    expect(calculateProviderCost(config)).toBe(25);
  });

  it("returns 0 for provider with no models", () => {
    const config: ModelProviderConfig = {
      baseUrl: "https://api.example.com",
      models: [],
    };
    expect(calculateProviderCost(config)).toBe(0);
  });

  it("handles free models", () => {
    const config: ModelProviderConfig = {
      baseUrl: "https://api.example.com",
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
    expect(calculateProviderCost(config)).toBe(0);
  });
});

describe("classifyProviderTier", () => {
  it("classifies local providers as LOCAL tier", () => {
    const config: ModelProviderConfig = {
      baseUrl: "http://127.0.0.1:8000/v1",
      models: [
        {
          id: "deepseek-r1",
          name: "DeepSeek R1",
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 8192,
        },
      ],
    };
    expect(classifyProviderTier(config)).toBe(ProviderTier.LOCAL);
  });

  it("classifies free providers as FREE_TIER", () => {
    const config: ModelProviderConfig = {
      baseUrl: "https://api.moonshot.cn/v1",
      models: [
        {
          id: "moonshot-v1",
          name: "Moonshot V1",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        },
      ],
    };
    expect(classifyProviderTier(config)).toBe(ProviderTier.FREE_TIER);
  });

  it("classifies low cost providers (< 10 cents/1M)", () => {
    const config: ModelProviderConfig = {
      baseUrl: "https://api.minimax.chat/v1",
      models: [
        {
          id: "minimax-01",
          name: "MiniMax 01",
          reasoning: false,
          input: ["text"],
          cost: { input: 5, output: 8, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        },
      ],
    };
    expect(classifyProviderTier(config)).toBe(ProviderTier.LOW_COST);
  });

  it("classifies medium cost providers (10-50 cents/1M)", () => {
    const config: ModelProviderConfig = {
      baseUrl: "https://api.example.com/v1",
      models: [
        {
          id: "model-1",
          name: "Model 1",
          reasoning: false,
          input: ["text"],
          cost: { input: 20, output: 30, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        },
      ],
    };
    expect(classifyProviderTier(config)).toBe(ProviderTier.MEDIUM_COST);
  });

  it("classifies high cost providers (> 50 cents/1M)", () => {
    const config: ModelProviderConfig = {
      baseUrl: "https://api.anthropic.com/v1/messages",
      models: [
        {
          id: "claude-opus-4-6",
          name: "Claude Opus 4.6",
          reasoning: false,
          input: ["text", "image"],
          cost: { input: 150, output: 750, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200000,
          maxTokens: 8192,
        },
      ],
    };
    expect(classifyProviderTier(config)).toBe(ProviderTier.HIGH_COST);
  });

  it("local providers are always LOCAL tier regardless of cost", () => {
    const config: ModelProviderConfig = {
      baseUrl: "http://localhost:8000/v1",
      models: [
        {
          id: "expensive-local",
          name: "Expensive Local",
          reasoning: false,
          input: ["text"],
          cost: { input: 1000, output: 2000, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        },
      ],
    };
    expect(classifyProviderTier(config)).toBe(ProviderTier.LOCAL);
  });
});
