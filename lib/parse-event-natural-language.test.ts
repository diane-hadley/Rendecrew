import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEventFromNaturalLanguage } from "./parse-event-natural-language";

const messagesCreate = vi.fn();

vi.mock("@/lib/anthropic", () => ({
  ANTHROPIC_MODEL: "test-model",
  getAnthropic: () => ({
    messages: {
      create: (...args: unknown[]) => messagesCreate(...args),
    },
  }),
}));

describe("parseEventFromNaturalLanguage", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });

  it("rejects empty input", async () => {
    const r = await parseEventFromNaturalLanguage("   ", "2026-01-01T00:00:00Z");
    expect(r).toEqual({
      ok: false,
      error: "Describe your event in a sentence or two",
    });
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns fields on valid JSON response", async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "Team lunch",
            description: null,
            location: "Cafe",
            startAt: "2026-06-01T12:00:00.000Z",
            endAt: "2026-06-01T13:00:00.000Z",
          }),
        },
      ],
    });

    const r = await parseEventFromNaturalLanguage(
      "lunch tomorrow",
      "2026-05-30T12:00:00Z",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.title).toBe("Team lunch");
      expect(r.fields.location).toBe("Cafe");
      expect(r.fields.startAt).toBe("2026-06-01T12:00:00.000Z");
      expect(r.fields.endAt).toBe("2026-06-01T13:00:00.000Z");
    }
  });

  it("extracts JSON from markdown fence", async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '```json\n{"title":"X","description":null,"location":null,"startAt":null,"endAt":null}\n```',
        },
      ],
    });
    const r = await parseEventFromNaturalLanguage("hi", "2026-01-01T00:00:00Z");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields.title).toBe("X");
  });

  it("rejects when only one of startAt/endAt is set", async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "Bad",
            description: null,
            location: null,
            startAt: "2026-01-01T00:00:00Z",
            endAt: null,
          }),
        },
      ],
    });
    const r = await parseEventFromNaturalLanguage("x", "2026-01-01T00:00:00Z");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/inconsistent/i);
    }
  });

  it("rejects missing title", async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "   ",
            description: null,
            location: null,
            startAt: null,
            endAt: null,
          }),
        },
      ],
    });
    const r = await parseEventFromNaturalLanguage("x", "2026-01-01T00:00:00Z");
    expect(r.ok).toBe(false);
  });

  it("maps API errors to ok false", async () => {
    messagesCreate.mockRejectedValue(new Error("rate limit"));
    const r = await parseEventFromNaturalLanguage("x", "2026-01-01T00:00:00Z");
    expect(r).toEqual({ ok: false, error: "rate limit" });
  });
});
