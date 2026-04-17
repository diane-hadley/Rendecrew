import { beforeEach, describe, expect, it, vi } from "vitest";

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
    event: { update: vi.fn() },
    packingList: { findUnique: vi.fn() },
  },
}));

import { MemberManagementPolicy, PackingListVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";
import { updateEventSettings } from "./event-settings";

describe("updateEventSettings", () => {
  beforeEach(() => {
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(getEventForUser).mockResolvedValue({
      role: "admin",
    } as never);
    vi.mocked(canManageEvent).mockReturnValue(true);
    vi.mocked(prisma.event.update).mockResolvedValue({} as never);
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue({
      liveblocksRoomId: "room-1",
    } as never);
    revalidatePath.mockReset();
  });

  const baseInput = {
    eventId: "e1",
    memberManagementPolicy: MemberManagementPolicy.ADMINS_ONLY,
    packingListVisibility: PackingListVisibility.MEMBERS_ONLY,
    suggestionApprovalRequired: true,
  };

  it("rejects when user cannot manage", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await updateEventSettings(baseInput);
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to change event settings",
    });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("rejects when role is not allowed to manage", async () => {
    vi.mocked(canManageEvent).mockReturnValueOnce(false);
    const r = await updateEventSettings(baseInput);
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to change event settings",
    });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("updates event and revalidates dashboard paths", async () => {
    const r = await updateEventSettings(baseInput);
    expect(r).toEqual({ ok: true });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: {
        memberManagementPolicy: MemberManagementPolicy.ADMINS_ONLY,
        packingListVisibility: PackingListVisibility.MEMBERS_ONLY,
        suggestionApprovalRequired: true,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
  });

  it("revalidates packing path when list has a room id", async () => {
    await updateEventSettings(baseInput);
    expect(revalidatePath).toHaveBeenCalledWith("/packing/room-1");
  });

  it("skips packing path revalidation when no room id", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValueOnce({
      liveblocksRoomId: null,
    } as never);
    await updateEventSettings(baseInput);
    expect(revalidatePath).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/packing\//),
    );
  });

  it("returns error when update throws", async () => {
    vi.mocked(prisma.event.update).mockRejectedValueOnce(new Error("db down"));
    const r = await updateEventSettings(baseInput);
    expect(r).toEqual({ ok: false, error: "db down" });
  });
});
