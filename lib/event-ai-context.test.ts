import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventAIContext } from "./event-ai-context";
import {
  formatEventContextForAISystemPrompt,
  getEventAISystemPromptSection,
  getEventContextForAI,
} from "./event-ai-context";

const prismaMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findUnique: prismaMock.findUnique,
    },
  },
}));

function ctx(partial: Partial<EventAIContext> = {}): EventAIContext {
  return {
    event: {
      id: "e1",
      title: "Party",
      description: null,
      location: null,
      startAt: null,
      endAt: null,
      ...partial.event,
    },
    packingList: partial.packingList ?? null,
  };
}

describe("formatEventContextForAISystemPrompt", () => {
  it("includes title and placeholders for missing fields", () => {
    const text = formatEventContextForAISystemPrompt(ctx());
    expect(text).toContain("Current event context:");
    expect(text).toContain("- Title: Party");
    expect(text).toContain("- Description: (none)");
    expect(text).toContain("- Location: (none)");
    expect(text).toContain("- When: (not set)");
    expect(text).toContain("Packing list: (none or empty)");
  });

  it("includes description, location, and ISO range when set", () => {
    const text = formatEventContextForAISystemPrompt(
      ctx({
        event: {
          description: "BYOB",
          location: "Roof",
          startAt: "2026-01-01T12:00:00.000Z",
          endAt: "2026-01-01T14:00:00.000Z",
        },
      }),
    );
    expect(text).toContain("- Description: BYOB");
    expect(text).toContain("- Location: Roof");
    expect(text).toContain("- When:");
    expect(text).toContain("2026-01-01T12:00:00.000Z");
  });

  it("formats packing items with optional and range quantities", () => {
    const text = formatEventContextForAISystemPrompt(
      ctx({
        packingList: {
          items: [
            {
              section: "Food",
              name: "Snacks",
              quantity: 0,
              quantityMax: 5,
              signUps: [],
            },
            {
              section: "Food",
              name: "Drinks",
              quantity: 2,
              quantityMax: 6,
              signUps: [],
            },
            {
              section: null,
              name: "Unsectioned",
              quantity: 1,
              quantityMax: null,
              signUps: [],
            },
          ],
        },
      }),
    );
    expect(text).toContain("[Food]");
    expect(text).toContain("Snacks");
    expect(text).toContain("(optional, up to 5)");
    expect(text).toContain("×2–6");
    expect(text).toContain("×1");
    expect(text).toContain("Unsectioned");
  });

  it("formats sign-up lines with quantity, packed, email, and linked user", () => {
    const text = formatEventContextForAISystemPrompt(
      ctx({
        packingList: {
          items: [
            {
              section: null,
              name: "Cooler",
              quantity: 2,
              quantityMax: null,
              signUps: [
                {
                  displayName: "Sam",
                  quantity: 1,
                  email: "sam@example.com",
                  hasLinkedUser: true,
                  packed: false,
                },
              ],
            },
          ],
        },
      }),
    );
    expect(text).toContain("Sam bringing");
    expect(text).toContain("not packed yet");
    expect(text).toContain("email sam@example.com");
    expect(text).toContain("linked Rendecrew account");
  });
});

describe("getEventContextForAI", () => {
  beforeEach(() => {
    prismaMock.findUnique.mockReset();
  });

  it("returns null when event is missing", async () => {
    prismaMock.findUnique.mockResolvedValue(null);
    expect(await getEventContextForAI("missing")).toBeNull();
  });

  it("maps event and packing list for AI", async () => {
    const start = new Date("2026-02-01T10:00:00.000Z");
    const end = new Date("2026-02-01T12:00:00.000Z");
    prismaMock.findUnique.mockResolvedValue({
      id: "e1",
      title: "Camp",
      description: "Fun",
      location: "Lake",
      startAt: start,
      endAt: end,
      packingList: {
        items: [
          {
            section: "Gear",
            name: "Tent",
            quantity: 1,
            quantityMax: null,
            signUps: [
              {
                displayName: "Alex",
                quantity: 1,
                email: null,
                userId: "u1",
                packed: true,
              },
            ],
          },
        ],
      },
    });

    const ctx = await getEventContextForAI("e1");
    expect(ctx).not.toBeNull();
    expect(ctx?.event.title).toBe("Camp");
    expect(ctx?.event.startAt).toBe(start.toISOString());
    expect(ctx?.packingList?.items[0]?.name).toBe("Tent");
    expect(ctx?.packingList?.items[0]?.signUps[0]?.hasLinkedUser).toBe(true);
    expect(ctx?.packingList?.items[0]?.signUps[0]?.packed).toBe(true);
  });
});

describe("getEventAISystemPromptSection", () => {
  beforeEach(() => {
    prismaMock.findUnique.mockReset();
  });

  it("returns null when event is missing", async () => {
    prismaMock.findUnique.mockResolvedValue(null);
    expect(await getEventAISystemPromptSection("x")).toBeNull();
  });

  it("returns formatted section when event exists", async () => {
    prismaMock.findUnique.mockResolvedValue({
      id: "e1",
      title: "Only title",
      description: null,
      location: null,
      startAt: null,
      endAt: null,
      packingList: null,
    });
    const section = await getEventAISystemPromptSection("e1");
    expect(section).toContain("Current event context:");
    expect(section).toContain("Only title");
  });
});
