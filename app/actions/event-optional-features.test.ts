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

const transaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { update: vi.fn() },
    packingList: { findUnique: vi.fn(), deleteMany: vi.fn() },
    personalPackingItem: { deleteMany: vi.fn() },
    packingSuggestion: { deleteMany: vi.fn() },
    userSuggestionState: { deleteMany: vi.fn() },
    eventRideCar: { deleteMany: vi.fn() },
    event_ride_custom_field_definitions: { deleteMany: vi.fn() },
    $transaction: transaction,
  },
}));

import { prisma } from "@/lib/prisma";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";
import {
  disableEventPackingFeature,
  disableEventRidesFeature,
  enableEventRidesFeature,
} from "./event-optional-features";

describe("event-optional-features", () => {
  beforeEach(() => {
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(getEventForUser).mockResolvedValue({
      role: "admin",
    } as never);
    vi.mocked(canManageEvent).mockReturnValue(true);
    vi.mocked(prisma.event.update).mockResolvedValue({} as never);
    transaction.mockReset();
    transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    vi.mocked(prisma.packingList.findUnique).mockResolvedValue({
      liveblocksRoomId: "room-1",
    } as never);
    revalidatePath.mockReset();
  });

  it("enableEventRidesFeature rejects when user cannot manage", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await enableEventRidesFeature("e1");
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to change this event",
    });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("enableEventRidesFeature rejects when role cannot manage", async () => {
    vi.mocked(canManageEvent).mockReturnValueOnce(false);
    const r = await enableEventRidesFeature("e1");
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to change this event",
    });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("enableEventRidesFeature returns error when update fails", async () => {
    vi.mocked(prisma.event.update).mockRejectedValueOnce(new Error("db err"));
    const r = await enableEventRidesFeature("e1");
    expect(r).toEqual({ ok: false, error: "db err" });
  });

  it("enableEventRidesFeature updates event and revalidates", async () => {
    const r = await enableEventRidesFeature("e1");
    expect(r).toEqual({ ok: true });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { ridesEnabled: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
  });

  it("disableEventPackingFeature runs delete transaction and revalidates packing path", async () => {
    const r = await disableEventPackingFeature("e1");
    expect(r).toEqual({ ok: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/packing/room-1");
  });

  it("disableEventPackingFeature rejects without permission", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await disableEventPackingFeature("e1");
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to change this event",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("disableEventPackingFeature does not revalidate packing without room id", async () => {
    vi.mocked(prisma.packingList.findUnique).mockResolvedValueOnce({
      liveblocksRoomId: null,
    } as never);
    const r = await disableEventPackingFeature("e1");
    expect(r).toEqual({ ok: true });
    expect(revalidatePath).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/packing\//),
    );
  });

  it("disableEventPackingFeature returns error when transaction fails", async () => {
    transaction.mockRejectedValueOnce(new Error("tx failed"));
    const r = await disableEventPackingFeature("e1");
    expect(r).toEqual({ ok: false, error: "tx failed" });
  });

  it("disableEventRidesFeature runs delete transaction", async () => {
    const r = await disableEventRidesFeature("e1");
    expect(r).toEqual({ ok: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(prisma.eventRideCar.deleteMany).toHaveBeenCalledWith({
      where: { eventId: "e1" },
    });
    expect(
      prisma.event_ride_custom_field_definitions.deleteMany,
    ).toHaveBeenCalledWith({ where: { event_id: "e1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
  });

  it("disableEventRidesFeature rejects without permission", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await disableEventRidesFeature("e1");
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to change this event",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("disableEventRidesFeature returns error when transaction fails", async () => {
    transaction.mockRejectedValueOnce(new Error("rides tx"));
    const r = await disableEventRidesFeature("e1");
    expect(r).toEqual({ ok: false, error: "rides tx" });
  });
});
