import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackingSuggestionStatus } from "@prisma/client";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/user", () => ({
  getOrCreateUser: vi.fn(),
}));

vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
  canManageEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    packingList: { findUnique: vi.fn() },
    event: { update: vi.fn(), findUnique: vi.fn() },
    packingSuggestion: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    userSuggestionState: { upsert: vi.fn() },
    personalPackingItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";
import {
  copySuggestionToPersonal,
  createPersonalPackingItem,
  deletePersonalPackingItem,
  markSuggestionsCatalogSeen,
  moderatePackingSuggestion,
  reorderPersonalPackingItems,
  setSuggestionApprovalRequired,
  suggestPackingItem,
  updatePersonalPackingItem,
} from "./packing-advanced";

describe("setSuggestionApprovalRequired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "creator",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(canManageEvent).mockReturnValue(true);
    vi.mocked(prisma.event.update).mockResolvedValue({} as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue({
      liveblocksRoomId: "room-1",
    } as never);
  });

  it("rejects when user cannot manage", async () => {
    vi.mocked(canManageEvent).mockReturnValue(false);
    const r = await setSuggestionApprovalRequired("e1", true);
    expect(r).toEqual({ ok: false, error: "Not allowed" });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("rejects when event row missing", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await setSuggestionApprovalRequired("e1", true);
    expect(r).toEqual({ ok: false, error: "Not allowed" });
  });

  it("updates flag and revalidates", async () => {
    const r = await setSuggestionApprovalRequired("e1", false);
    expect(r).toEqual({ ok: true });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { suggestionApprovalRequired: false },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/packing/room-1");
  });

  it("revalidates dashboard only when no packing list", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValueOnce(null);
    const r = await setSuggestionApprovalRequired("e1", true);
    expect(r).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
    expect(revalidatePath).not.toHaveBeenCalledWith("/packing/room-1");
  });

  it("maps non-Error throws", async () => {
    vi.mocked(prisma.event.update).mockRejectedValueOnce("x");
    const r = await setSuggestionApprovalRequired("e1", true);
    expect(r).toEqual({
      ok: false,
      error: "Could not update suggestion settings",
    });
  });
});

describe("suggestPackingItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "member",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      suggestionApprovalRequired: false,
    } as never);
    vi.mocked(prisma.packingSuggestion.create).mockResolvedValue({
      id: "sug-1",
    } as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
  });

  it("rejects when event not found", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await suggestPackingItem("e1", { name: "Tent" });
    expect(r).toEqual({ ok: false, error: "Event not found" });
  });

  it("rejects invalid name", async () => {
    const r = await suggestPackingItem("e1", { name: "   " });
    expect(r).toEqual({ ok: false, error: "Invalid name" });
  });

  it("rejects non-integer default quantity", async () => {
    const r = await suggestPackingItem("e1", {
      name: "Tent",
      defaultQuantity: 1.5,
    });
    expect(r).toEqual({ ok: false, error: "Invalid default quantity" });
  });

  it("creates draft when approval required", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      suggestionApprovalRequired: true,
    } as never);
    const r = await suggestPackingItem("e1", {
      name: "  Cooler  ",
      section: "  Kitchen ",
      defaultQuantity: 2,
    });
    expect(r).toEqual({ ok: true, id: "sug-1" });
    expect(prisma.packingSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: PackingSuggestionStatus.DRAFT_USER,
        name: "Cooler",
        section: "Kitchen",
        defaultQuantity: 2,
      }),
    });
  });

  it("creates published when approval not required", async () => {
    const r = await suggestPackingItem("e1", {
      name: "Chair",
      section: null,
      defaultQuantity: null,
    });
    expect(r).toEqual({ ok: true, id: "sug-1" });
    expect(prisma.packingSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: PackingSuggestionStatus.PUBLISHED,
        section: null,
        defaultQuantity: null,
      }),
    });
  });
});

describe("moderatePackingSuggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "creator",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(canManageEvent).mockReturnValue(true);
    vi.mocked(prisma.packingSuggestion.findUnique).mockResolvedValue({
      eventId: "e1",
      status: PackingSuggestionStatus.DRAFT_USER,
    } as never);
    vi.mocked(prisma.packingSuggestion.update).mockResolvedValue({} as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
  });

  it("rejects missing suggestion", async () => {
    vi.mocked(prisma.packingSuggestion.findUnique).mockResolvedValueOnce(null);
    const r = await moderatePackingSuggestion("x", "publish");
    expect(r).toEqual({ ok: false, error: "Suggestion not found" });
  });

  it("rejects when not allowed", async () => {
    vi.mocked(canManageEvent).mockReturnValue(false);
    const r = await moderatePackingSuggestion("s1", "reject");
    expect(r).toEqual({ ok: false, error: "Not allowed" });
  });

  it("publish sets status", async () => {
    const r = await moderatePackingSuggestion("s1", "publish");
    expect(r).toEqual({ ok: true });
    expect(prisma.packingSuggestion.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({
        status: PackingSuggestionStatus.PUBLISHED,
        reviewedByUserId: "u1",
      }),
    });
  });

  it("reject and archive set status", async () => {
    await moderatePackingSuggestion("s1", "reject");
    expect(prisma.packingSuggestion.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PackingSuggestionStatus.REJECTED,
        }),
      }),
    );
    await moderatePackingSuggestion("s2", "archive");
    expect(prisma.packingSuggestion.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PackingSuggestionStatus.ARCHIVED,
        }),
      }),
    );
  });
});

describe("markSuggestionsCatalogSeen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "member",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(prisma.userSuggestionState.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
  });

  it("rejects when not a participant", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await markSuggestionsCatalogSeen("e1");
    expect(r).toEqual({ ok: false, error: "Event not found" });
  });

  it("upserts state", async () => {
    const r = await markSuggestionsCatalogSeen("e1");
    expect(r).toEqual({ ok: true });
    expect(prisma.userSuggestionState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_eventId: { userId: "u1", eventId: "e1" } },
        create: expect.objectContaining({
          userId: "u1",
          eventId: "e1",
        }),
        update: expect.objectContaining({
          lastSeenSuggestionCatalogAt: expect.any(Date),
        }),
      }),
    );
  });
});

describe("copySuggestionToPersonal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "member",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(prisma.packingSuggestion.findFirst).mockResolvedValue({
      id: "sug-1",
      eventId: "e1",
      name: "Lantern",
      section: "Gear",
      defaultQuantity: 3,
    } as never);
    vi.mocked(prisma.personalPackingItem.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.personalPackingItem.aggregate).mockResolvedValue({
      _max: { sortOrder: 2 },
    } as never);
    vi.mocked(prisma.personalPackingItem.create).mockResolvedValue({
      id: "pi-1",
    } as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
  });

  it("rejects unavailable suggestion", async () => {
    vi.mocked(prisma.packingSuggestion.findFirst).mockResolvedValueOnce(null);
    const r = await copySuggestionToPersonal("sug-1");
    expect(r).toEqual({ ok: false, error: "Suggestion not available" });
  });

  it("rejects duplicate copy", async () => {
    vi.mocked(prisma.personalPackingItem.findFirst).mockResolvedValueOnce({
      id: "existing",
    } as never);
    const r = await copySuggestionToPersonal("sug-1");
    expect(r).toEqual({ ok: false, error: "Already copied to your list" });
  });

  it("coerces invalid quantity to 1", async () => {
    const r = await copySuggestionToPersonal("sug-1", 0);
    expect(r).toEqual({ ok: true, id: "pi-1" });
    expect(prisma.personalPackingItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ quantity: 1 }),
    });
  });

  it("uses explicit quantity", async () => {
    const r = await copySuggestionToPersonal("sug-1", 5);
    expect(r).toEqual({ ok: true, id: "pi-1" });
    expect(prisma.personalPackingItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quantity: 5,
        sourceSuggestionId: "sug-1",
      }),
    });
  });
});

describe("createPersonalPackingItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "member",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(prisma.personalPackingItem.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(prisma.personalPackingItem.create).mockResolvedValue({
      id: "n1",
    } as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
  });

  it("rejects invalid name", async () => {
    const r = await createPersonalPackingItem("e1", { name: "" });
    expect(r).toEqual({ ok: false, error: "Invalid name" });
  });

  it("normalizes section and quantity", async () => {
    const r = await createPersonalPackingItem("e1", {
      name: "Towel",
      section: "   ",
      quantity: 0,
    });
    expect(r).toEqual({ ok: true, id: "n1" });
    expect(prisma.personalPackingItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        section: null,
        quantity: 1,
        sortOrder: 0,
      }),
    });
  });
});

describe("updatePersonalPackingItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(prisma.personalPackingItem.findFirst).mockResolvedValue({
      id: "pi-1",
      eventId: "e1",
      name: "Old",
      section: null,
      quantity: 1,
      packed: false,
    } as never);
    vi.mocked(prisma.personalPackingItem.update).mockResolvedValue({} as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
  });

  it("rejects when row missing", async () => {
    vi.mocked(prisma.personalPackingItem.findFirst).mockResolvedValueOnce(null);
    const r = await updatePersonalPackingItem("pi-1", { packed: true });
    expect(r).toEqual({ ok: false, error: "Not found" });
  });

  it("rejects invalid name update", async () => {
    const r = await updatePersonalPackingItem("pi-1", { name: "  " });
    expect(r).toEqual({ ok: false, error: "Invalid name" });
  });

  it("rejects invalid quantity", async () => {
    const r = await updatePersonalPackingItem("pi-1", { quantity: 1.2 });
    expect(r).toEqual({ ok: false, error: "Invalid quantity" });
  });

  it("updates packed only", async () => {
    const r = await updatePersonalPackingItem("pi-1", { packed: true });
    expect(r).toEqual({ ok: true });
    expect(prisma.personalPackingItem.update).toHaveBeenCalledWith({
      where: { id: "pi-1" },
      data: { packed: true },
    });
  });
});

describe("reorderPersonalPackingItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "member",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(prisma.personalPackingItem.findMany).mockResolvedValue([
      { id: "a" },
      { id: "b" },
    ] as never);
    vi.mocked(prisma.$transaction).mockResolvedValue(undefined as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
  });

  it("applies stable indices and section updates", async () => {
    const r = await reorderPersonalPackingItems("e1", [
      { id: "b", section: "Kitchen" },
      { id: "a", section: null },
    ]);
    expect(r).toEqual({ ok: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.personalPackingItem.update).toHaveBeenCalledWith({
      where: { id: "b" },
      data: { sortOrder: 0, section: "Kitchen" },
    });
    expect(prisma.personalPackingItem.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { sortOrder: 1, section: null },
    });
  });
});

describe("deletePersonalPackingItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(prisma.personalPackingItem.findFirst).mockResolvedValue({
      eventId: "e1",
    } as never);
    vi.mocked(prisma.personalPackingItem.delete).mockResolvedValue({} as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue(null);
  });

  it("rejects when missing", async () => {
    vi.mocked(prisma.personalPackingItem.findFirst).mockResolvedValueOnce(null);
    const r = await deletePersonalPackingItem("x");
    expect(r).toEqual({ ok: false, error: "Not found" });
  });

  it("deletes and revalidates", async () => {
    const r = await deletePersonalPackingItem("pi-1");
    expect(r).toEqual({ ok: true });
    expect(prisma.personalPackingItem.delete).toHaveBeenCalledWith({
      where: { id: "pi-1" },
    });
  });
});
