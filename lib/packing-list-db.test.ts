import { PackingListVisibility } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PackingItemPayload } from "./packing-list";
import {
  backfillPackingItemSignUpsForUser,
  countDraftUserPackingSuggestionsForEvent,
  createPackingListForEvent,
  getPackingListByRoomId,
  getPackingListForEvent,
  persistPackingListItems,
} from "./packing-list";

vi.mock("@/lib/packing-notifications", () => ({
  emitPackingPersistNotifications: vi.fn().mockResolvedValue(undefined),
  buildPackingPersistNotificationQueue: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    packingSuggestion: { count: vi.fn() },
    packingList: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    packingItemSignUp: {
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    eventMember: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";

describe("countDraftUserPackingSuggestionsForEvent", () => {
  it("counts draft user suggestions", async () => {
    vi.mocked(prisma.packingSuggestion.count).mockResolvedValue(3);
    await expect(countDraftUserPackingSuggestionsForEvent("e1")).resolves.toBe(
      3,
    );
    expect(prisma.packingSuggestion.count).toHaveBeenCalledWith({
      where: { eventId: "e1", status: "DRAFT_USER" },
    });
  });
});

describe("getPackingListByRoomId", () => {
  it("delegates to prisma", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue({
      id: "pl1",
    } as never);
    const r = await getPackingListByRoomId("room-x");
    expect(prisma.packingList.findUnique).toHaveBeenCalledWith({
      where: { liveblocksRoomId: "room-x" },
      include: expect.any(Object),
    });
    expect(r).toEqual({ id: "pl1" });
  });
});

describe("getPackingListForEvent", () => {
  it("delegates to prisma", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
    const r = await getPackingListForEvent("e1");
    expect(prisma.packingList.findUnique).toHaveBeenCalledWith({
      where: { eventId: "e1" },
      include: expect.any(Object),
    });
    expect(r).toBeNull();
  });
});

describe("createPackingListForEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing list", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue({
      id: "x",
      eventId: "e1",
    } as never);
    const r = await createPackingListForEvent("e1");
    expect(r).toEqual({ id: "x", eventId: "e1" });
    expect(prisma.packingList.create).not.toHaveBeenCalled();
  });

  it("creates when missing", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.packingList.create).mockResolvedValue({
      id: "new",
      eventId: "e1",
      liveblocksRoomId: "rid",
    } as never);
    const r = await createPackingListForEvent("e1");
    expect(r).toMatchObject({ eventId: "e1" });
    expect(prisma.packingList.create).toHaveBeenCalled();
  });

  it("retries on unique collision", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.packingList.create)
      .mockRejectedValueOnce(new Error("unique"))
      .mockResolvedValueOnce({
        id: "ok",
        eventId: "e1",
        liveblocksRoomId: "r2",
      } as never);
    const r = await createPackingListForEvent("e1");
    expect(r).toMatchObject({ id: "ok" });
    expect(prisma.packingList.create).toHaveBeenCalledTimes(2);
  });
});

describe("backfillPackingItemSignUpsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when email empty after normalize", async () => {
    await backfillPackingItemSignUpsForUser("u1", "   ");
    expect(prisma.packingItemSignUp.updateMany).not.toHaveBeenCalled();
  });

  it("updates sign-ups by email", async () => {
    vi.mocked(prisma.packingItemSignUp.updateMany).mockResolvedValue({
      count: 2,
    } as never);
    await backfillPackingItemSignUpsForUser("u1", "  Pat@Example.COM ");
    expect(prisma.packingItemSignUp.updateMany).toHaveBeenCalledWith({
      where: {
        userId: null,
        email: { equals: "pat@example.com", mode: "insensitive" },
      },
      data: { userId: "u1" },
    });
  });
});

describe("persistPackingListItems", () => {
  const tx = {
    packingSection: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    packingItem: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    packingItemSignUp: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  };

  const baseList = {
    id: "plist-1",
    eventId: "ev1",
    event: { packingListVisibility: PackingListVisibility.URL_PUBLIC },
    sections: [] as unknown[],
    items: [] as unknown[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tx.packingSection.deleteMany.mockReset();
    tx.packingSection.upsert.mockReset();
    tx.packingItem.findMany.mockReset();
    tx.packingItem.deleteMany.mockReset();
    tx.packingItem.upsert.mockReset();
    tx.packingItemSignUp.findMany.mockReset();
    tx.packingItemSignUp.deleteMany.mockReset();
    tx.packingItemSignUp.createMany.mockReset();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      return (fn as (t: typeof tx) => Promise<unknown>)(tx);
    });
  });

  it("rejects when list missing", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
    const r = await persistPackingListItems("room", [], {
      kind: "admin",
      userId: "u-org",
    });
    expect(r).toEqual({ ok: false, error: "Packing list not found" });
  });

  it("rejects too many items", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(
      baseList as never,
    );
    const items = Array.from({ length: 501 }, (_, i) => ({
      id: `i${i}`,
      sectionId: null as string | null,
      name: "x",
      quantity: null as number | null,
      signUps: [] as PackingItemPayload["signUps"],
    }));
    const r = await persistPackingListItems("room", items, {
      kind: "admin",
      userId: "u-org",
    });
    expect(r).toEqual({ ok: false, error: "Too many items" });
  });

  it("rejects invalid item name", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(
      baseList as never,
    );
    const r = await persistPackingListItems(
      "room",
      [
        {
          id: "i1",
          sectionId: null,
          name: "",
          quantity: null,
          signUps: [],
        },
      ],
      { kind: "admin", userId: "u-org" },
    );
    expect(r).toEqual({ ok: false, error: "Invalid item name" });
  });

  it("succeeds for admin with one item and no sign-ups", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(
      baseList as never,
    );
    tx.packingItem.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    tx.packingItemSignUp.findMany.mockResolvedValue([]);
    const items: PackingItemPayload[] = [
      {
        id: "i1",
        sectionId: null,
        name: "Tent",
        quantity: 1,
        quantityMax: null,
        signUps: [],
      },
    ];
    const r = await persistPackingListItems("room", items, {
      kind: "admin",
      userId: "u-org",
    });
    expect(r).toEqual({ ok: true });
    expect(tx.packingItem.upsert).toHaveBeenCalled();
    expect(tx.packingItemSignUp.deleteMany).toHaveBeenCalled();
  });

  it("validates unknown user on sign-up", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue({
      ...baseList,
      items: [],
    } as never);
    vi.mocked(prisma.eventMember.findUnique).mockResolvedValue(null);
    const r = await persistPackingListItems(
      "room",
      [
        {
          id: "i1",
          sectionId: null,
          name: "Tent",
          quantity: 1,
          signUps: [
            {
              id: "s1",
              quantity: 1,
              displayName: "Pat",
              email: null,
              userId: "missing-user",
              packed: false,
            },
          ],
        },
      ],
      { kind: "admin", userId: "u-org" },
    );
    expect(r).toEqual({
      ok: false,
      error: "Sign-up user must be an event member",
    });
  });
});
