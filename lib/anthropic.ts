import Anthropic from "@anthropic-ai/sdk";

/**
 * Default model for Rendecrew's Claude integration (Claude API alias).
 * @see https://docs.anthropic.com/en/docs/about-claude/models/overview
 */
export const ANTHROPIC_MODEL = "claude-sonnet-4-5" as const;

const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
};

/**
 * Singleton Anthropic client for server-side use (Server Actions, Route Handlers).
 * Requires `ANTHROPIC_API_KEY` in the environment.
 */
export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  if (!globalForAnthropic.anthropic) {
    globalForAnthropic.anthropic = new Anthropic({ apiKey });
  }
  return globalForAnthropic.anthropic;
}
