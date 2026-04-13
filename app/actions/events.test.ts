import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, redirect, transaction } = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const redirect = vi.fn((url: string) => {
    const e = new Error(`REDIRECT:${url}`);
    throw e;
  });
  const transaction = vi.fn();
  return { revalidatePath, redirect, transaction };
});

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
    event: {
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
  canManageEvent: vi.fn(),
  canDeleteEvent: vi.fn(),
}));

vi.mock("@/lib/parse-event-natural-language", () => ({
  parseEventFromNaturalLanguage: vi.fn(),
}));

vi.mock("@/lib/user", () => ({
  getOrCreateUser: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { canDeleteEvent, canManageEvent, getEventForUser } from "@/lib/events";
import { parseEventFromNaturalLanguage } from "@/lib/parse-event-natural-language";
import { getOrCreateUser } from "@/lib/user";
import {
  createEvent,
  createEventFromNaturalLanguage,
  deleteEvent,
  updateEvent,
} from "./events";

describe("updateEvent", () => {
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
  });

  it("fails when title is empty", async () => {
    const r = await updateEvent({
      eventId: "e1",
      title: "   ",
      description: null,
      startAt: null,
      endAt: null,
      location: null,
    });
    expect(r).toEqual({ ok: false, error: "Title is required" });
  });

  it("fails when only start is provided", async () => {
    const r = await updateEvent({
      eventId: "e1",
      title: "T",
      startAt: new Date(),
      endAt: null,
    });
    expect(r).toEqual({
      ok: false,
      error: "Provide both start and end, or leave both empty",
    });
  });

  it("fails when only end is provided", async () => {
    const r = await updateEvent({
      eventId: "e1",
      title: "T",
      startAt: null,
      endAt: new Date(),
    });
    expect(r).toEqual({
      ok: false,
      error: "Provide both start and end, or leave both empty",
    });
  });

  it("fails when end is before start", async () => {
    const start = new Date("2026-01-02T12:00:00Z");
    const end = new Date("2026-01-01T12:00:00Z");
    const r = await updateEvent({
      eventId: "e1",
      title: "T",
      startAt: start,
      endAt: end,
    });
    expect(r).toEqual({ ok: false, error: "End must be on or after start" });
  });

  it("fails without permission", async () => {
    vi.mocked(canManageEvent).mockReturnValue(false);
    const r = await updateEvent({
      eventId: "e1",
      title: "T",
      startAt: null,
      endAt: null,
    });
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to edit this event",
    });
  });

  it("fails when event is not found", async () => {
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const r = await updateEvent({
      eventId: "e1",
      title: "T",
      startAt: null,
      endAt: null,
    });
    expect(r).toEqual({
      ok: false,
      error: "You do not have permission to edit this event",
    });
  });

  it("updates and revalidates on success", async () => {
    vi.mocked(prisma.event.update).mockResolvedValueOnce({} as never);
    const r = await updateEvent({
      eventId: "e1",
      title: " Title ",
      description: " d ",
      startAt: null,
      endAt: null,
      location: " L ",
    });
    expect(r).toEqual({ ok: true });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: {
        title: "Title",
        description: "d",
        startAt: null,
        endAt: null,
        location: "L",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
  });

  it("returns error when prisma update throws", async () => {
    vi.mocked(prisma.event.update).mockRejectedValueOnce(new Error("db"));
    const r = await updateEvent({
      eventId: "e1",
      title: "T",
      startAt: null,
      endAt: null,
    });
    expect(r).toEqual({ ok: false, error: "db" });
  });
});

describe("deleteEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1", createdById: "u1" },
      role: "creator",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(canDeleteEvent).mockReturnValue(true);
  });

  it("fails without permission", async () => {
    vi.mocked(canDeleteEvent).mockReturnValue(false);
    const r = await deleteEvent("e1");
    expect(r).toEqual({
      ok: false,
      error: "Only the event creator can delete this event",
    });
  });

  it("deletes and revalidates on success", async () => {
    vi.mocked(prisma.event.delete).mockResolvedValueOnce({} as never);
    const r = await deleteEvent("e1");
    expect(r).toEqual({ ok: true });
    expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
  });
});

describe("createEventFromNaturalLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          event: {
            create: vi.fn().mockResolvedValue({ id: "new-e" }),
          },
          eventMember: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        await fn(tx);
      },
    );
  });

  it("returns parse error when parser fails", async () => {
    vi.mocked(parseEventFromNaturalLanguage).mockResolvedValue({
      ok: false,
      error: "bad text",
    });
    const r = await createEventFromNaturalLanguage("x");
    expect(r).toEqual({ ok: false, error: "bad text" });
  });

  it("returns create error when DB fails", async () => {
    vi.mocked(parseEventFromNaturalLanguage).mockResolvedValue({
      ok: true,
      fields: {
        title: "Party",
        description: null,
        location: null,
        startAt: null,
        endAt: null,
      },
    });
    transaction.mockRejectedValueOnce(new Error("tx fail"));
    const r = await createEventFromNaturalLanguage("plan a party");
    expect(r).toEqual({ ok: false, error: "tx fail" });
  });

  it("redirects to the new event on success", async () => {
    vi.mocked(parseEventFromNaturalLanguage).mockResolvedValue({
      ok: true,
      fields: {
        title: "Party",
        description: null,
        location: null,
        startAt: null,
        endAt: null,
      },
    });
    await expect(createEventFromNaturalLanguage("plan")).rejects.toThrow(
      "REDIRECT:/dashboard/events/new-e",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/new-e");
  });
});

describe("createEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as Awaited<
      ReturnType<typeof getOrCreateUser>
    >);
    transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          event: {
            create: vi.fn().mockResolvedValue({ id: "created-id" }),
          },
          eventMember: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        await fn(tx);
      },
    );
  });

  it("returns validation error without redirect when title is missing", async () => {
    const r = await createEvent({
      title: "  ",
      startAt: null,
      endAt: null,
    });
    expect(r).toEqual({ ok: false, error: "Title is required" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to dashboard on success", async () => {
    await expect(
      createEvent({
        title: "Hello",
        startAt: null,
        endAt: null,
      }),
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});
