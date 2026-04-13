import { beforeEach, describe, expect, it, vi } from "vitest";
import { assistEventGeneralInformation } from "./event-general-information-ai";

const messagesCreate = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  ANTHROPIC_MODEL: "claude-test",
  getAnthropic: vi.fn(() => ({
    messages: { create: messagesCreate },
  })),
}));

vi.mock("@/lib/user", () => ({
  getOrCreateUser: vi.fn(),
}));

vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
  canManageEvent: vi.fn(),
}));

import { canManageEvent, getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";

describe("assistEventGeneralInformation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "  # Hi\n\nThere  " }],
    });
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: {
        id: "e1",
        title: "Trip",
        generalInformation: null,
        location: "Lake",
        startAt: new Date("2026-01-01T12:00:00Z"),
        endAt: new Date("2026-01-02T12:00:00Z"),
        createdById: "u1",
        suggestionApprovalRequired: false,
        memberManagementPolicy: "ANY_MEMBER_CAN_INVITE",
        packingListVisibility: "URL_PUBLIC",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      role: "creator",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(canManageEvent).mockReturnValue(true);
  });

  it("rejects empty instruction", async () => {
    const r = await assistEventGeneralInformation("e1", {
      instruction: "   ",
      currentMarkdown: "",
    });
    expect(r).toEqual({
      ok: false,
      error: "Describe what you want the assistant to write",
    });
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("rejects when user cannot manage event", async () => {
    vi.mocked(canManageEvent).mockReturnValue(false);
    const r = await assistEventGeneralInformation("e1", {
      instruction: "Add itinerary",
      currentMarkdown: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/permission/i);
    }
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns trimmed markdown on success", async () => {
    const r = await assistEventGeneralInformation("e1", {
      instruction: "Write intro",
      currentMarkdown: "x",
    });
    expect(r).toEqual({ ok: true, markdown: "# Hi\n\nThere" });
    expect(messagesCreate).toHaveBeenCalled();
  });

  it("concatenates multiple text blocks", async () => {
    messagesCreate.mockResolvedValue({
      content: [
        { type: "text", text: "  # A  " },
        { type: "text", text: "B" },
      ],
    });
    const r = await assistEventGeneralInformation("e1", {
      instruction: "Go",
      currentMarkdown: "",
    });
    expect(r).toEqual({ ok: true, markdown: "# A\n\nB" });
  });

  it("strips a single outer markdown code fence", async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "```markdown\n# Title\n\nBody\n```",
        },
      ],
    });
    const r = await assistEventGeneralInformation("e1", {
      instruction: "Go",
      currentMarkdown: "",
    });
    expect(r).toEqual({ ok: true, markdown: "# Title\n\nBody" });
  });
});
