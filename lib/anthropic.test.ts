import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    apiKey: string;
    constructor(opts: { apiKey: string }) {
      this.apiKey = opts.apiKey;
    }
  },
}));

describe("getAnthropic", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const g = globalThis as unknown as {
    anthropic?: unknown;
    anthropicApiKey?: string;
  };

  beforeEach(() => {
    delete g.anthropic;
    delete g.anthropicApiKey;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    delete g.anthropic;
    delete g.anthropicApiKey;
  });

  it("throws when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { getAnthropic } = await import("./anthropic");
    expect(() => getAnthropic()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("returns a client when key is set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-anthropic";
    const { getAnthropic } = await import("./anthropic");
    const a = getAnthropic();
    const b = getAnthropic();
    expect(a).toBe(b);
  });

  it("recreates client when API key changes", async () => {
    process.env.ANTHROPIC_API_KEY = "key-a";
    const { getAnthropic } = await import("./anthropic");
    const first = getAnthropic();
    process.env.ANTHROPIC_API_KEY = "key-b";
    const second = getAnthropic();
    expect(second).not.toBe(first);
  });
});
