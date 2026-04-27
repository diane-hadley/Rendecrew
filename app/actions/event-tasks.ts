"use server";

import { EventTaskStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getEventForUser } from "@/lib/events";
import { enqueueNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

export type TaskMemberListItem = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
};

export type TaskAssignmentRow = {
  id: string;
  eventMember: TaskMemberListItem;
  doneAt: string | null;
};

export type EventTaskRow = {
  id: string;
  eventId: string;
  title: string;
  notes: string | null;
  status: EventTaskStatus;
  /** ISO instant (UTC) or null. */
  dueDate: string | null;
  sortOrder: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: TaskAssignmentRow[];
};

export type TaskView = "GROUP_OPEN" | "GROUP_DONE" | "USER_OPEN" | "USER_DONE";

export type ListEventTasksResult =
  | {
      ok: true;
      me: { userId: string; eventMemberId: string | null };
      tasks: EventTaskRow[];
    }
  | { ok: false; error: string };

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function requireEventMember(eventId: string) {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false as const, error: "Event not found" };

  const membership = await prisma.eventMember.findFirst({
    where: { eventId, userId: user.id },
    select: { id: true },
  });

  return { ok: true as const, user, row, membershipId: membership?.id ?? null };
}

async function requireTaskBoardEnabled(eventId: string) {
  const r = await requireEventMember(eventId);
  if (!r.ok) return r;
  if (!r.row.event.taskBoardEnabled) {
    return {
      ok: false as const,
      error: "Task board is disabled for this event",
    };
  }
  return r;
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function normalizeTitle(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.length > 200) return s.slice(0, 200).trim();
  return s;
}

function normalizeNotes(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > 4000 ? s.slice(0, 4000) : s;
}

function normalizeDueDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  // Accept:
  // - YYYY-MM-DD
  // - YYYY-MM-DDTHH:mm (browser-local wall time)
  // - any Date-ish input
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      if (!y || !m || !d) return null;
      return new Date(Date.UTC(y, m - 1, d));
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
      // Date(string) interprets this as local time.
      const dt = new Date(s);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
  }
  const dt = new Date(v as never);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function taskToRow(t: {
  id: string;
  eventId: string;
  title: string;
  notes: string | null;
  status: EventTaskStatus;
  dueDate: Date | null;
  sortOrder: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignments: Array<{
    id: string;
    doneAt: Date | null;
    eventMember: {
      id: string;
      userId: string;
      user: { id: string; name: string; email: string };
    };
  }>;
}): EventTaskRow {
  return {
    id: t.id,
    eventId: t.eventId,
    title: t.title,
    notes: t.notes,
    status: t.status,
    dueDate: toIso(t.dueDate),
    sortOrder: t.sortOrder,
    createdByUserId: t.createdByUserId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    assignments: t.assignments.map((a) => ({
      id: a.id,
      doneAt: toIso(a.doneAt),
      eventMember: {
        membershipId: a.eventMember.id,
        userId: a.eventMember.userId,
        name: a.eventMember.user.name,
        email: a.eventMember.user.email,
      },
    })),
  };
}

async function recomputeOverallStatus(
  tx: Prisma.TransactionClient,
  taskId: string,
) {
  const task = await tx.eventTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      assignments: { select: { doneAt: true } },
    },
  });
  if (!task) return;

  const assignedCount = task.assignments.length;
  const allDone =
    assignedCount === 0
      ? null
      : task.assignments.every((a) => a.doneAt != null);

  if (assignedCount > 0 && allDone === true) {
    if (task.status !== EventTaskStatus.DONE) {
      await tx.eventTask.update({
        where: { id: taskId },
        data: { status: EventTaskStatus.DONE },
      });
    }
    return;
  }

  if (task.status === EventTaskStatus.DONE && allDone === false) {
    await tx.eventTask.update({
      where: { id: taskId },
      data: { status: EventTaskStatus.IN_PROGRESS },
    });
  }
}

export async function listEventTasks(
  eventId: string,
  params: { view: TaskView; userId?: string | null } = { view: "GROUP_OPEN" },
): Promise<ListEventTasksResult> {
  const r = await requireTaskBoardEnabled(eventId);
  if (!r.ok) return r;

  const view = params.view;
  const requestedUserId = (params.userId ?? null) || r.user.id;
  const memberId =
    requestedUserId === r.user.id
      ? r.membershipId
      : ((
          await prisma.eventMember.findFirst({
            where: { eventId, userId: requestedUserId },
            select: { id: true },
          })
        )?.id ?? null);

  const where: Prisma.EventTaskWhereInput =
    view === "GROUP_OPEN"
      ? {
          eventId,
          status: { in: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS] },
        }
      : view === "GROUP_DONE"
        ? { eventId, status: EventTaskStatus.DONE }
        : view === "USER_OPEN"
          ? memberId
            ? {
                eventId,
                assignments: {
                  some: { eventMemberId: memberId, doneAt: null },
                },
              }
            : { eventId, id: { in: [] } }
          : memberId
            ? {
                eventId,
                assignments: {
                  some: { eventMemberId: memberId, doneAt: { not: null } },
                },
              }
            : { eventId, id: { in: [] } };

  const tasks = await prisma.eventTask.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { status: "asc" }, { updatedAt: "desc" }],
    include: {
      assignments: {
        include: {
          eventMember: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  return {
    ok: true,
    me: { userId: r.user.id, eventMemberId: r.membershipId },
    tasks: tasks.map(taskToRow),
  };
}

export async function createEventTask(params: {
  eventId: string;
  title: string;
  notes?: string | null;
  status?: EventTaskStatus;
  dueDate?: string | Date | null;
  assignedEventMemberIds?: string[] | null;
}): Promise<{ ok: true; taskId: string } | Err> {
  const r = await requireTaskBoardEnabled(params.eventId);
  if (!r.ok) return r;

  const title = normalizeTitle(params.title);
  if (!title) return { ok: false, error: "Title is required" };

  const notes = normalizeNotes(params.notes);
  const dueDate = normalizeDueDate(params.dueDate);
  const status = params.status ?? EventTaskStatus.TO_DO;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const task = await tx.eventTask.create({
        data: {
          eventId: params.eventId,
          title,
          notes,
          dueDate,
          status,
          createdByUserId: r.user.id,
        },
        select: { id: true },
      });

      const memberIds = (params.assignedEventMemberIds ?? []).filter(Boolean);
      if (memberIds.length) {
        const members = await tx.eventMember.findMany({
          where: { eventId: params.eventId, id: { in: memberIds } },
          select: { id: true },
        });
        await tx.eventTaskAssignment.createMany({
          data: members.map((m) => ({ taskId: task.id, eventMemberId: m.id })),
          skipDuplicates: true,
        });
      }

      await recomputeOverallStatus(tx, task.id);
      return task;
    });

    const taskRow = await prisma.eventTask.findUnique({
      where: { id: created.id },
      select: {
        title: true,
        event: { select: { title: true } },
        assignments: { include: { eventMember: { select: { userId: true } } } },
      },
    });
    if (taskRow) {
      const eventTitle = taskRow.event.title;
      for (const a of taskRow.assignments) {
        await enqueueNotification({
          recipientUserId: a.eventMember.userId,
          actorUserId: r.user.id,
          kind: "tasks.assignment_changed",
          eventId: params.eventId,
          metadata: {
            eventId: params.eventId,
            eventTitle,
            taskId: created.id,
            taskTitle: taskRow.title,
          },
        });
      }
    }

    revalidatePath(`/dashboard/events/${params.eventId}`);
    return { ok: true, taskId: created.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create task";
    return { ok: false, error: msg };
  }
}

export async function updateEventTask(params: {
  taskId: string;
  title?: string;
  notes?: string | null;
  status?: EventTaskStatus;
  dueDate?: string | Date | null;
}): Promise<Ok | Err> {
  const existing = await prisma.eventTask.findUnique({
    where: { id: params.taskId },
    select: { id: true, eventId: true },
  });
  if (!existing) return { ok: false, error: "Task not found" };

  const r = await requireTaskBoardEnabled(existing.eventId);
  if (!r.ok) return r;

  const nextTitle =
    params.title === undefined ? undefined : normalizeTitle(params.title);
  if (params.title !== undefined && !nextTitle) {
    return { ok: false, error: "Title is required" };
  }
  const nextNotes =
    params.notes === undefined ? undefined : normalizeNotes(params.notes);
  const nextDue =
    params.dueDate === undefined ? undefined : normalizeDueDate(params.dueDate);

  const before = await prisma.eventTask.findUnique({
    where: { id: params.taskId },
    select: {
      dueDate: true,
      assignments: {
        include: { eventMember: { select: { userId: true } } },
      },
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      if (params.status === EventTaskStatus.DONE) {
        const assignees = await tx.eventTaskAssignment.findMany({
          where: { taskId: params.taskId },
          select: { doneAt: true },
        });
        if (assignees.length > 0 && assignees.some((a) => a.doneAt == null)) {
          throw new Error(
            "Cannot set Done until all assigned members have marked done.",
          );
        }
      }

      const data: Prisma.EventTaskUpdateInput = {};
      if (typeof nextTitle === "string") data.title = nextTitle;
      if (nextNotes !== undefined) data.notes = nextNotes;
      if (nextDue !== undefined) data.dueDate = nextDue;
      if (params.status !== undefined) data.status = params.status;

      await tx.eventTask.update({
        where: { id: params.taskId },
        data,
      });

      await recomputeOverallStatus(tx, params.taskId);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update task";
    return { ok: false, error: msg };
  }

  if (before && params.dueDate !== undefined && before.assignments.length > 0) {
    const newDue = normalizeDueDate(params.dueDate);
    const oldKey = before.dueDate ? before.dueDate.toISOString() : null;
    const newKey = newDue ? newDue.toISOString() : null;
    if (oldKey !== newKey) {
      const taskMeta = await prisma.eventTask.findUnique({
        where: { id: params.taskId },
        select: { title: true, event: { select: { title: true } } },
      });
      const eventTitle = taskMeta?.event.title;
      for (const a of before.assignments) {
        await enqueueNotification({
          recipientUserId: a.eventMember.userId,
          actorUserId: r.user.id,
          kind: "tasks.due_date_changed",
          eventId: existing.eventId,
          metadata: {
            eventId: existing.eventId,
            eventTitle,
            taskId: params.taskId,
            taskTitle: taskMeta?.title ?? null,
            dueDateFrom: oldKey,
            dueDateTo: newKey,
          },
        });
      }
    }
  }

  revalidatePath(`/dashboard/events/${existing.eventId}`);
  return { ok: true };
}

export async function deleteEventTask(taskId: string): Promise<Ok | Err> {
  const existing = await prisma.eventTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      eventId: true,
      title: true,
      event: { select: { title: true } },
      assignments: {
        include: { eventMember: { select: { userId: true } } },
      },
    },
  });
  if (!existing) return { ok: false, error: "Task not found" };

  const r = await requireTaskBoardEnabled(existing.eventId);
  if (!r.ok) return r;

  const eventTitle = existing.event.title;

  await prisma.eventTask.delete({ where: { id: taskId } });

  for (const a of existing.assignments) {
    await enqueueNotification({
      recipientUserId: a.eventMember.userId,
      actorUserId: r.user.id,
      kind: "tasks.assignment_changed",
      eventId: existing.eventId,
      metadata: {
        eventId: existing.eventId,
        eventTitle,
        taskId: existing.id,
        taskTitle: existing.title,
        change: "task_deleted",
      },
    });
  }

  revalidatePath(`/dashboard/events/${existing.eventId}`);
  return { ok: true };
}

export async function assignMembersToTask(params: {
  taskId: string;
  eventMemberIds: string[];
}): Promise<Ok | Err> {
  const task = await prisma.eventTask.findUnique({
    where: { id: params.taskId },
    select: { id: true, eventId: true },
  });
  if (!task) return { ok: false, error: "Task not found" };

  const r = await requireTaskBoardEnabled(task.eventId);
  if (!r.ok) return r;

  const memberIds = params.eventMemberIds.filter(Boolean);
  if (memberIds.length === 0) return { ok: true };

  const priorAssignments = await prisma.eventTaskAssignment.findMany({
    where: { taskId: task.id },
    select: { eventMemberId: true },
  });
  const priorMemberIds = new Set(priorAssignments.map((p) => p.eventMemberId));

  try {
    await prisma.$transaction(async (tx) => {
      const members = await tx.eventMember.findMany({
        where: { eventId: task.eventId, id: { in: memberIds } },
        select: { id: true },
      });
      await tx.eventTaskAssignment.createMany({
        data: members.map((m) => ({ taskId: task.id, eventMemberId: m.id })),
        skipDuplicates: true,
      });
      await recomputeOverallStatus(tx, task.id);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to assign members";
    return { ok: false, error: msg };
  }

  const addedMemberIds = memberIds.filter((id) => !priorMemberIds.has(id));
  if (addedMemberIds.length) {
    const taskMeta = await prisma.eventTask.findUnique({
      where: { id: task.id },
      select: { title: true, event: { select: { title: true } } },
    });
    const eventTitle = taskMeta?.event.title;
    const newMembers = await prisma.eventMember.findMany({
      where: { eventId: task.eventId, id: { in: addedMemberIds } },
      select: { userId: true },
    });
    for (const m of newMembers) {
      await enqueueNotification({
        recipientUserId: m.userId,
        actorUserId: r.user.id,
        kind: "tasks.assignment_changed",
        eventId: task.eventId,
        metadata: {
          eventId: task.eventId,
          eventTitle,
          taskId: task.id,
          taskTitle: taskMeta?.title ?? null,
        },
      });
    }
  }

  revalidatePath(`/dashboard/events/${task.eventId}`);
  return { ok: true };
}

export async function unassignMembersFromTask(params: {
  taskId: string;
  eventMemberIds: string[];
}): Promise<Ok | Err> {
  const task = await prisma.eventTask.findUnique({
    where: { id: params.taskId },
    select: { id: true, eventId: true },
  });
  if (!task) return { ok: false, error: "Task not found" };

  const r = await requireTaskBoardEnabled(task.eventId);
  if (!r.ok) return r;

  const memberIds = params.eventMemberIds.filter(Boolean);
  if (memberIds.length === 0) return { ok: true };

  const taskMeta = await prisma.eventTask.findUnique({
    where: { id: task.id },
    select: { title: true, event: { select: { title: true } } },
  });
  const eventTitle = taskMeta?.event.title;
  const removedMembers = await prisma.eventMember.findMany({
    where: { eventId: task.eventId, id: { in: memberIds } },
    select: { userId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.eventTaskAssignment.deleteMany({
      where: { taskId: task.id, eventMemberId: { in: memberIds } },
    });
    await recomputeOverallStatus(tx, task.id);
  });

  for (const m of removedMembers) {
    await enqueueNotification({
      recipientUserId: m.userId,
      actorUserId: r.user.id,
      kind: "tasks.assignment_changed",
      eventId: task.eventId,
      metadata: {
        eventId: task.eventId,
        eventTitle,
        taskId: task.id,
        taskTitle: taskMeta?.title ?? null,
        change: "unassigned",
      },
    });
  }

  revalidatePath(`/dashboard/events/${task.eventId}`);
  return { ok: true };
}

export async function assignEveryoneToTask(taskId: string): Promise<Ok | Err> {
  const task = await prisma.eventTask.findUnique({
    where: { id: taskId },
    select: { id: true, eventId: true },
  });
  if (!task) return { ok: false, error: "Task not found" };

  const r = await requireTaskBoardEnabled(task.eventId);
  if (!r.ok) return r;

  const prior = await prisma.eventTaskAssignment.findMany({
    where: { taskId: task.id },
    select: { eventMemberId: true },
  });
  const priorSet = new Set(prior.map((p) => p.eventMemberId));

  await prisma.$transaction(async (tx) => {
    const members = await tx.eventMember.findMany({
      where: { eventId: task.eventId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    await tx.eventTaskAssignment.createMany({
      data: members.map((m) => ({ taskId: task.id, eventMemberId: m.id })),
      skipDuplicates: true,
    });
    await recomputeOverallStatus(tx, task.id);
  });

  const allMembers = await prisma.eventMember.findMany({
    where: { eventId: task.eventId },
    select: { id: true, userId: true },
  });
  const taskMeta = await prisma.eventTask.findUnique({
    where: { id: task.id },
    select: { title: true, event: { select: { title: true } } },
  });
  const eventTitle = taskMeta?.event.title;
  for (const m of allMembers) {
    if (priorSet.has(m.id)) continue;
    await enqueueNotification({
      recipientUserId: m.userId,
      actorUserId: r.user.id,
      kind: "tasks.assignment_changed",
      eventId: task.eventId,
      metadata: {
        eventId: task.eventId,
        eventTitle,
        taskId: task.id,
        taskTitle: taskMeta?.title ?? null,
      },
    });
  }

  revalidatePath(`/dashboard/events/${task.eventId}`);
  return { ok: true };
}

export async function setMyTaskDone(params: {
  taskId: string;
  done: boolean;
}): Promise<Ok | Err> {
  const task = await prisma.eventTask.findUnique({
    where: { id: params.taskId },
    select: { id: true, eventId: true },
  });
  if (!task) return { ok: false, error: "Task not found" };

  const r = await requireTaskBoardEnabled(task.eventId);
  if (!r.ok) return r;
  if (!r.membershipId)
    return { ok: false, error: "You are not a member of this event" };

  const assignment = await prisma.eventTaskAssignment.findFirst({
    where: { taskId: task.id, eventMemberId: r.membershipId },
    select: { id: true },
  });
  if (!assignment) {
    return { ok: false, error: "You are not assigned to this task" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventTaskAssignment.update({
      where: { id: assignment.id },
      data: {
        doneAt: params.done ? new Date() : null,
        doneByUserId: params.done ? r.user.id : null,
      },
    });
    await recomputeOverallStatus(tx, task.id);
  });

  revalidatePath(`/dashboard/events/${task.eventId}`);
  return { ok: true };
}
