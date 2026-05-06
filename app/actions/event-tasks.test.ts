import {
  EventTaskAssigneeCompletionMode,
  EventTaskStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, transaction } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/notifications", () => ({
  enqueueNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transaction,
    eventMember: { findFirst: vi.fn(), findMany: vi.fn() },
    eventTask: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    eventTaskAssignment: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
}));

vi.mock("@/lib/user", () => ({
  getOrCreateUser: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";
import { listEventTasks, updateEventTask } from "./event-tasks";

describe("listEventTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: {
        id: "e1",
        startAtTimeZone: "America/Los_Angeles",
        taskBoardEnabled: true,
      },
      role: "member",
    } as never);
    vi.mocked(prisma.eventMember.findFirst).mockResolvedValue({
      id: "m-self",
    } as never);
    vi.mocked(prisma.eventMember.findMany).mockImplementation((args) => {
      const ids = ((args?.where as { id?: { in?: string[] } })?.id?.in ??
        []) as string[];
      if (ids.includes("m1")) return Promise.resolve([{ id: "m1" }] as never);
      return Promise.resolve([] as never);
    });
    vi.mocked(prisma.eventTask.findMany).mockResolvedValue([] as never);
  });

  it("uses All + Open: event tasks not done", async () => {
    const r = await listEventTasks("e1", {
      statusFilter: {
        kind: "SET",
        statuses: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
      },
      userFilter: { kind: "ALL" },
    });
    expect(r.ok).toBe(true);
    expect(prisma.eventTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: "e1",
          status: {
            in: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
          },
        },
      }),
    );
  });

  it("uses member slice + Open with EACH/ANY OR (spec §3.5)", async () => {
    const r = await listEventTasks("e1", {
      statusFilter: {
        kind: "SET",
        statuses: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
      },
      userFilter: { kind: "MEMBERS", eventMemberIds: ["m1"] },
    });
    expect(r.ok).toBe(true);
    expect(prisma.eventMember.findMany).toHaveBeenCalledWith({
      where: { eventId: "e1", id: { in: ["m1"] } },
      select: { id: true },
    });
    expect(prisma.eventTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: "e1",
          status: {
            in: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
          },
          OR: [
            {
              assigneeCompletionMode: EventTaskAssigneeCompletionMode.EACH,
              assignments: {
                some: { eventMemberId: { in: ["m1"] }, doneAt: null },
              },
            },
            {
              assigneeCompletionMode: EventTaskAssigneeCompletionMode.ANY,
              assignments: { some: { eventMemberId: { in: ["m1"] } } },
            },
          ],
        },
      }),
    );
  });

  it("User + Done: EACH row-done vs ANY overall-done (spec §3.5)", async () => {
    const r = await listEventTasks("e1", {
      statusFilter: { kind: "SET", statuses: [EventTaskStatus.DONE] },
      userFilter: { kind: "MEMBERS", eventMemberIds: ["m1"] },
    });
    expect(r.ok).toBe(true);
    expect(prisma.eventTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: "e1",
          OR: [
            {
              assigneeCompletionMode: EventTaskAssigneeCompletionMode.EACH,
              assignments: {
                some: { eventMemberId: { in: ["m1"] }, doneAt: { not: null } },
              },
            },
            {
              assigneeCompletionMode: EventTaskAssigneeCompletionMode.ANY,
              status: EventTaskStatus.DONE,
              assignments: { some: { eventMemberId: { in: ["m1"] } } },
            },
          ],
        },
      }),
    );
  });

  it("returns no tasks when member id is not in the event", async () => {
    const r = await listEventTasks("e1", {
      statusFilter: {
        kind: "SET",
        statuses: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
      },
      userFilter: { kind: "MEMBERS", eventMemberIds: ["ghost"] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tasks).toEqual([]);
    expect(prisma.eventTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "e1", id: { in: [] } },
      }),
    );
  });
});

describe("updateEventTask (assignee completion mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: {
        id: "e1",
        startAtTimeZone: "America/Los_Angeles",
        taskBoardEnabled: true,
      },
      role: "member",
    } as never);
    revalidatePath.mockReset();
  });

  it("rejects Done when EACH and an assignee is not done", async () => {
    vi.mocked(prisma.eventTask.findUnique)
      .mockResolvedValueOnce({ id: "t1", eventId: "e1" } as never)
      .mockResolvedValueOnce({
        dueDate: null,
        assignments: [],
      } as never);

    const mockTx = {
      eventTask: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            assigneeCompletionMode: EventTaskAssigneeCompletionMode.EACH,
            status: EventTaskStatus.IN_PROGRESS,
            assignments: [{ doneAt: new Date() }, { doneAt: null }],
          })
          .mockResolvedValueOnce({
            assigneeCompletionMode: EventTaskAssigneeCompletionMode.EACH,
            assignments: [{ doneAt: new Date() }, { doneAt: null }],
          }),
        update: vi.fn(),
      },
      eventTaskAssignment: {
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
    };

    transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx),
    );

    const r = await updateEventTask({
      taskId: "t1",
      status: EventTaskStatus.DONE,
    });
    expect(r).toEqual({
      ok: false,
      error: "Cannot set Done until all assigned members have marked done.",
    });
    expect(mockTx.eventTask.update).not.toHaveBeenCalled();
  });

  it("allows Done when ANY and not every assignee is done", async () => {
    vi.mocked(prisma.eventTask.findUnique)
      .mockResolvedValueOnce({ id: "t1", eventId: "e1" } as never)
      .mockResolvedValueOnce({
        dueDate: null,
        assignments: [],
      } as never);

    const mockTx = {
      eventTask: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            assigneeCompletionMode: EventTaskAssigneeCompletionMode.ANY,
            status: EventTaskStatus.IN_PROGRESS,
            assignments: [{ doneAt: null }, { doneAt: null }],
          })
          .mockResolvedValueOnce({
            assigneeCompletionMode: EventTaskAssigneeCompletionMode.ANY,
            assignments: [{ doneAt: null }, { doneAt: null }],
          }),
        update: vi.fn(),
      },
      eventTaskAssignment: {
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
    };

    transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx),
    );

    const r = await updateEventTask({
      taskId: "t1",
      status: EventTaskStatus.DONE,
    });
    expect(r).toEqual({ ok: true });
    expect(mockTx.eventTask.update).toHaveBeenCalled();
  });

  it("Any → Each while Done clears per-assignee completion and reopens (spec §2.4)", async () => {
    vi.mocked(prisma.eventTask.findUnique)
      .mockResolvedValueOnce({ id: "t1", eventId: "e1" } as never)
      .mockResolvedValueOnce({
        dueDate: null,
        assignments: [],
      } as never);

    const mockTx = {
      eventTask: {
        findUnique: vi.fn().mockResolvedValueOnce({
          assigneeCompletionMode: EventTaskAssigneeCompletionMode.ANY,
          status: EventTaskStatus.DONE,
          assignments: [{ doneAt: new Date() }],
        }),
        update: vi.fn(),
      },
      eventTaskAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn(),
      },
    };

    transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx),
    );

    const r = await updateEventTask({
      taskId: "t1",
      assigneeCompletionMode: EventTaskAssigneeCompletionMode.EACH,
    });
    expect(r).toEqual({ ok: true });
    expect(mockTx.eventTaskAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { taskId: "t1" },
        data: { doneAt: null, doneByUserId: null },
      }),
    );
    expect(mockTx.eventTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeCompletionMode: EventTaskAssigneeCompletionMode.EACH,
          status: EventTaskStatus.TO_DO,
        }),
      }),
    );
  });
});
