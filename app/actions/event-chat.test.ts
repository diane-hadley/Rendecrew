import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendEventChatMessage } from "./event-chat";

vi.mock("@/lib/user", () => ({
  getOrCreateUser: vi.fn(),
}));

vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
}));

vi.mock("@/lib/event-ai-context", () => ({
  getEventAISystemPromptSection: vi.fn(),
}));

const messagesCreate = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  ANTHROPIC_MODEL: "claude-test",
  getAnthropic: vi.fn(() => ({
    messages: { create: messagesCreate },
  })),
}));

import { getAnthropic } from "@/lib/anthropic";
import { getEventAISystemPromptSection } from "@/lib/event-ai-context";
import { getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";

describe("sendEventChatMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "  Hello  " }],
    });
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      name: "Test",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1", title: "E" },
      role: "owner",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(getEventAISystemPromptSection).mockResolvedValue("CTX");
  });

  it("rejects empty conversation", async () => {
    const r = await sendEventChatMessage("e1", []);
    expect(r).toEqual({ ok: false, error: "Send a message to start" });
  });

  it("rejects when last message is not from user", async () => {
    const r = await sendEventChatMessage("e1", [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hey" },
    ]);
    expect(r).toEqual({ ok: false, error: "Last message must be from the user" });
  });

  it("rejects non-alternating roles", async () => {
    const r = await sendEventChatMessage("e1", [
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ]);
    expect(r).toEqual({
      ok: false,
      error: "Messages must alternate between user and assistant",
    });
  });

  it("rejects when conversation does not start with user", async () => {
    const r = await sendEventChatMessage("e1", [
      { role: "assistant", content: "hi" },
      { role: "user", content: "?" },
    ]);
    expect(r).toEqual({
      ok: false,
      error: "Conversation must start with a user message",
    });
  });

  it("rejects empty message content", async () => {
    const r = await sendEventChatMessage("e1", [{ role: "user", content: "   " }]);
    expect(r).toEqual({ ok: false, error: "Messages cannot be empty" });
  });

  it("rejects overly long last user message", async () => {
    const long = "x".repeat(8001);
    const r = await sendEventChatMessage("e1", [{ role: "user", content: long }]);
    expect(r).toEqual({
      ok: false,
      error: "Message is too long (max 8000 characters)",
    });
  });

  it("returns error when event is missing or inaccessible", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await sendEventChatMessage("e1", [{ role: "user", content: "hi" }]);
    expect(r).toEqual({
      ok: false,
      error: "Event not found or you do not have access",
    });
  });

  it("returns error when event context cannot be loaded", async () => {
    vi.mocked(getEventAISystemPromptSection).mockResolvedValueOnce(null);
    const r = await sendEventChatMessage("e1", [{ role: "user", content: "hi" }]);
    expect(r).toEqual({ ok: false, error: "Could not load event context" });
  });

  it("returns error when Anthropic client cannot be created", async () => {
    vi.mocked(getAnthropic).mockImplementationOnce(() => {
      throw new Error("no key");
    });
    const r = await sendEventChatMessage("e1", [{ role: "user", content: "hi" }]);
    expect(r).toEqual({ ok: false, error: "no key" });
  });

  it("returns assistant reply on success", async () => {
    const r = await sendEventChatMessage("e1", [{ role: "user", content: "hi" }]);
    expect(r).toEqual({ ok: true, reply: "Hello" });
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "hi" }],
      }),
    );
  });

  it("returns error when model response has no text block", async () => {
    messagesCreate.mockResolvedValueOnce({ content: [{ type: "tool_use" }] });
    const r = await sendEventChatMessage("e1", [{ role: "user", content: "hi" }]);
    expect(r).toEqual({ ok: false, error: "No text response from the model" });
  });

  it("returns error when API throws", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("rate limit"));
    const r = await sendEventChatMessage("e1", [{ role: "user", content: "hi" }]);
    expect(r).toEqual({ ok: false, error: "rate limit" });
  });

  it("passes a long valid thread to the API (39 messages, under the 40 cap)", async () => {
    const msgs = Array.from({ length: 39 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: String(i),
    }));
    await sendEventChatMessage("e1", msgs);
    const arg = messagesCreate.mock.calls[0][0] as { messages: { content: string }[] };
    expect(arg.messages).toHaveLength(39);
    expect(arg.messages[38].role).toBe("user");
  });
});
