import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/user", () => ({
  getOrCreateUser: vi.fn(),
  getOptionalDbUser: vi.fn(),
}));

vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
  canManageEvent: vi.fn(),
}));

vi.mock("@/lib/packing-list", () => ({
  createPackingListForEvent: vi.fn(),
  getPackingListByRoomId: vi.fn(),
  persistPackingListItems: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    packingList: { findUnique: vi.fn() },
    packingItemSignUp: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { canManageEvent, getEventForUser } from "@/lib/events";
import type { PackingItemPayload } from "@/lib/packing-list";
import {
  createPackingListForEvent,
  getPackingListByRoomId,
  persistPackingListItems,
} from "@/lib/packing-list";
import { getOptionalDbUser, getOrCreateUser } from "@/lib/user";
import {
  enablePackingListForEvent,
  setMyPackingSignUpPacked,
  syncPackingListToDatabase,
} from "./packing-list";

describe("enablePackingListForEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "owner",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(canManageEvent).mockReturnValue(true);
    vi.mocked(createPackingListForEvent).mockResolvedValue({
      liveblocksRoomId: "room-1",
    } as Awaited<ReturnType<typeof createPackingListForEvent>>);
  });

  it("fails without permission", async () => {
    vi.mocked(canManageEvent).mockReturnValue(false);
    const r = await enablePackingListForEvent("e1");
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to enable a packing list",
    });
  });

  it("fails when event is missing", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await enablePackingListForEvent("e1");
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to enable a packing list",
    });
  });

  it("creates list and revalidates on success", async () => {
    const r = await enablePackingListForEvent("e1");
    expect(r).toEqual({ ok: true, liveblocksRoomId: "room-1" });
    expect(createPackingListForEvent).toHaveBeenCalledWith("e1");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
  });

  it("returns error when create throws", async () => {
    vi.mocked(createPackingListForEvent).mockRejectedValueOnce(
      new Error("boom"),
    );
    const r = await enablePackingListForEvent("e1");
    expect(r).toEqual({ ok: false, error: "boom" });
  });
});

describe("syncPackingListToDatabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackingListByRoomId).mockResolvedValue({
      eventId: "ev1",
      event: { id: "ev1", title: "Party" },
      liveblocksRoomId: "room-1",
    } as Awaited<ReturnType<typeof getPackingListByRoomId>>);
    vi.mocked(persistPackingListItems).mockResolvedValue({ ok: true });
    vi.mocked(getOptionalDbUser).mockResolvedValue({
      id: "u1",
      name: "Alex",
      email: "a@b.c",
    });
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "ev1" },
      role: "owner",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(canManageEvent).mockReturnValue(true);
  });

  it("fails for unknown room", async () => {
    vi.mocked(getPackingListByRoomId).mockResolvedValueOnce(null);
    const r = await syncPackingListToDatabase("x", []);
    expect(r).toEqual({ ok: false, error: "Invalid packing list" });
  });

  it("returns persist error when persist fails", async () => {
    vi.mocked(persistPackingListItems).mockResolvedValueOnce({
      ok: false,
      error: "bad items",
    });
    const r = await syncPackingListToDatabase("room-1", []);
    expect(r).toEqual({ ok: false, error: "bad items" });
  });

  it("revalidates on success", async () => {
    const items: PackingItemPayload[] = [
      { id: "i1", name: "Towel", quantity: 1, signUps: [] },
    ];
    const r = await syncPackingListToDatabase("room-1", items);
    expect(r).toEqual({ ok: true });
    expect(persistPackingListItems).toHaveBeenCalledWith("room-1", items, {
      kind: "organizer",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/ev1");
    expect(revalidatePath).toHaveBeenCalledWith("/packing/room-1");
  });
});

describe("setMyPackingSignUpPacked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "member",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue({
      id: "pl1",
    } as Awaited<ReturnType<typeof prisma.packingList.findUnique>>);
    vi.mocked(prisma.packingItemSignUp.findFirst).mockResolvedValue({
      id: "su1",
    } as Awaited<ReturnType<typeof prisma.packingItemSignUp.findFirst>>);
    vi.mocked(prisma.packingItemSignUp.update).mockResolvedValue({} as never);
  });

  it("fails when event not found", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await setMyPackingSignUpPacked("e1", "su1", true);
    expect(r).toEqual({ ok: false, error: "Event not found" });
  });

  it("fails when packing list missing", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValueOnce(null);
    const r = await setMyPackingSignUpPacked("e1", "su1", true);
    expect(r).toEqual({ ok: false, error: "No packing list for this event" });
  });

  it("fails when sign-up not found for user", async () => {
    vi.mocked(prisma.packingItemSignUp.findFirst).mockResolvedValueOnce(null);
    const r = await setMyPackingSignUpPacked("e1", "su1", true);
    expect(r).toEqual({ ok: false, error: "Sign-up not found" });
  });

  it("updates packed flag and revalidates", async () => {
    const r = await setMyPackingSignUpPacked("e1", "su1", false);
    expect(r).toEqual({ ok: true });
    expect(prisma.packingItemSignUp.update).toHaveBeenCalledWith({
      where: { id: "su1" },
      data: { packed: false },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
  });
});
