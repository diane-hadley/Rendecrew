import { afterEach, describe, expect, it, vi } from "vitest";
import { isPreviewPlatformOperator } from "./preview-platform";

describe("isPreviewPlatformOperator", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows everyone when env is unset", () => {
    vi.stubEnv("RENDECREW_PREVIEW_OPERATOR_CLERK_IDS", "");
    expect(isPreviewPlatformOperator("user_abc")).toBe(true);
  });

  it("allows only listed Clerk ids when env is set", () => {
    vi.stubEnv("RENDECREW_PREVIEW_OPERATOR_CLERK_IDS", " user_a , user_b ");
    expect(isPreviewPlatformOperator("user_a")).toBe(true);
    expect(isPreviewPlatformOperator("user_b")).toBe(true);
    expect(isPreviewPlatformOperator("user_c")).toBe(false);
  });
});
