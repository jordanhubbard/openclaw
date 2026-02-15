import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resetModelCatalogCacheForTest, __setModelCatalogImportForTest } from "./model-catalog.js";
import { runWithModelFallback } from "./model-fallback.js";

function makeCfg(overrides: Partial<OpenClawConfig> = {}): OpenClawConfig {
  return {
    agents: {
      defaults: {
        model: {
          primary: "anthropic/claude-opus-4-6",
          fallbacks: ["vllm/deepseek-r1"],
        },
      },
    },
    models: {
      providers: {
        vllm: {
          baseUrl: "http://127.0.0.1:8000/v1",
          apiKey: "none",
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
        },
        anthropic: {
          baseUrl: "https://api.anthropic.com/v1/messages",
          apiKey: "test-key",
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
        },
      },
      routing: {
        enabled: false, // Default disabled
      },
    },
    ...overrides,
  } as OpenClawConfig;
}

describe("runWithModelFallback with intelligent ranking", () => {
  beforeEach(() => {
    resetModelCatalogCacheForTest();
    // Mock the model catalog to return our test models
    __setModelCatalogImportForTest(async () => ({
      AuthStorage: class MockAuthStorage {},
      ModelRegistry: class MockModelRegistry {
        getAll() {
          return [
            {
              id: "deepseek-r1",
              name: "DeepSeek R1",
              provider: "vllm",
              contextWindow: 128000,
              reasoning: true,
              input: ["text"],
            },
            {
              id: "claude-opus-4-6",
              name: "Claude Opus 4.6",
              provider: "anthropic",
              contextWindow: 200000,
              reasoning: false,
              input: ["text", "image"],
            },
          ];
        }
      },
    }));
  });

  afterEach(() => {
    resetModelCatalogCacheForTest();
  });

  it("uses original order when routing disabled", async () => {
    const cfg = makeCfg();
    const run = vi.fn().mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-6",
      requirements: { streaming: true },
      run,
    });

    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    // Should use anthropic first (primary), not vllm
    expect(run).toHaveBeenCalledWith("anthropic", "claude-opus-4-6");
  });

  it("prefers local vLLM over expensive provider when routing enabled", async () => {
    const cfg = makeCfg({
      models: {
        ...makeCfg().models,
        routing: {
          enabled: true,
          preferLocal: true,
        },
      },
    });
    const run = vi.fn().mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-6",
      requirements: { streaming: true },
      run,
    });

    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    // Should use vllm first (higher score) even though anthropic is primary
    expect(run).toHaveBeenCalledWith("vllm", "deepseek-r1");
  });

  it("falls back to anthropic when vLLM fails", async () => {
    const cfg = makeCfg({
      models: {
        ...makeCfg().models,
        routing: {
          enabled: true,
          preferLocal: true,
        },
      },
    });
    const run = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("503 Service Unavailable"), { status: 503 }))
      .mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-6",
      requirements: { streaming: true },
      run,
    });

    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
    // Should try vllm first, then fall back to anthropic
    expect(run.mock.calls[0]).toEqual(["vllm", "deepseek-r1"]);
    expect(run.mock.calls[1]).toEqual(["anthropic", "claude-opus-4-6"]);
  });

  it("filters out non-reasoning models when reasoning required", async () => {
    const cfg = makeCfg({
      models: {
        ...makeCfg().models,
        routing: {
          enabled: true,
          requireReasoning: true,
        },
      },
    });
    const run = vi.fn().mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-6",
      requirements: { reasoning: true, streaming: true },
      run,
    });

    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    // Should use vllm (only reasoning model), skip anthropic
    expect(run).toHaveBeenCalledWith("vllm", "deepseek-r1");
  });

  it("handles ranking failure gracefully", async () => {
    const cfg = makeCfg({
      models: {
        ...makeCfg().models,
        routing: {
          enabled: true,
        },
      },
    });

    // Mock catalog loading to fail
    __setModelCatalogImportForTest(async () => {
      throw new Error("Failed to load catalog");
    });

    const run = vi.fn().mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-6",
      requirements: { streaming: true },
      run,
    });

    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    // Should fall back to original order when ranking fails
    expect(run).toHaveBeenCalledWith("anthropic", "claude-opus-4-6");
  });

  it("does not apply ranking when requirements not provided", async () => {
    const cfg = makeCfg({
      models: {
        ...makeCfg().models,
        routing: {
          enabled: true,
        },
      },
    });
    const run = vi.fn().mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-6",
      // No requirements parameter
      run,
    });

    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    // Should use original order when requirements not provided
    expect(run).toHaveBeenCalledWith("anthropic", "claude-opus-4-6");
  });

  it("respects explicit fallbacksOverride when ranking enabled", async () => {
    const cfg = makeCfg({
      models: {
        ...makeCfg().models,
        routing: {
          enabled: true,
        },
      },
    });
    const run = vi.fn().mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-6",
      requirements: { streaming: true },
      fallbacksOverride: [], // Explicit empty fallbacks
      run,
    });

    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    // With empty fallbacks, should only have anthropic as candidate
    expect(run).toHaveBeenCalledWith("anthropic", "claude-opus-4-6");
  });
});
