"use server";

import {
  EventTaskAssigneeCompletionMode,
  EventTaskStatus,
  Prisma,
} from "@prisma/client";

export type { EventTaskAssigneeCompletionMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getEventForUser } from "@/lib/events";
import { enqueueNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";
import { normalizeTimeZone, parseEventDateTime } from "@/lib/event-datetime";

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
  assigneeCompletionMode: EventTaskAssigneeCompletionMode;
  /** ISO instant (UTC) or null. */
  dueDate: string | null;
  /** IANA zone used to interpret/display `dueDate` (wall time). */
  dueDateTimeZone: string | null;
  sortOrder: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: TaskAssignmentRow[];
};

/** Overall task status bucket (independent of assignee slice). */
export type TaskListStatusFilter = "OPEN" | "DONE";

/**
 * User slice for the task list. ALL = every event task (subject to status).
 * MEMBER = tasks tied to that event membership (see spec §3.5).
 */
export type TaskListUserFilter =
  | { kind: "ALL" }
  | { kind: "MEMBER"; eventMemberId: string };

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

function taskToRow(t: {
  id: string;
  eventId: string;
  title: string;
  notes: string | null;
  status: EventTaskStatus;
  assigneeCompletionMode: EventTaskAssigneeCompletionMode;
  dueDate: Date | null;
  dueDateTimeZone: string | null;
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
    assigneeCompletionMode: t.assigneeCompletionMode,
    dueDate: toIso(t.dueDate),
    dueDateTimeZone: t.dueDateTimeZone,
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

/** Single assignee or legacy rows: treat as EACH. */
function effectiveAssigneeMode(
  assigneeCount: number,
  mode: EventTaskAssigneeCompletionMode,
): EventTaskAssigneeCompletionMode {
  return assigneeCount < 2
    ? EventTaskAssigneeCompletionMode.EACH
    : mode;
}

async function normalizeAssigneeCompletionMode(
  tx: Prisma.TransactionClient,
  taskId: string,
) {
  const task = await tx.eventTask.findUnique({
    where: { id: taskId },
    select: {
      assigneeCompletionMode: true,
      assignments: { select: { id: true } },
    },
  });
  if (!task) return;
  if (
    task.assignments.length < 2 &&
    task.assigneeCompletionMode === EventTaskAssigneeCompletionMode.ANY
  ) {
    await tx.eventTask.update({
      where: { id: taskId },
      data: { assigneeCompletionMode: EventTaskAssigneeCompletionMode.EACH },
    });
  }
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
      assigneeCompletionMode: true,
      assignments: { select: { doneAt: true } },
    },
  });
  if (!task) return;

  const assignedCount = task.assignments.length;
  const mode = effectiveAssigneeMode(
    assignedCount,
    task.assigneeCompletionMode,
  );

  if (mode === EventTaskAssigneeCompletionMode.EACH) {
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
      await normalizeAssigneeCompletionMode(tx, taskId);
      return;
    }

    if (task.status === EventTaskStatus.DONE && allDone === false) {
      await tx.eventTask.update({
        where: { id: taskId },
        data: { status: EventTaskStatus.IN_PROGRESS },
      });
    }
    await normalizeAssigneeCompletionMode(tx, taskId);
    return;
  }

  // ANY (multi-assignee): overall DONE is not derived from every doneAt; do not
  // reopen DONE when a new assignee has no doneAt (spec §4, ANY).
  await normalizeAssigneeCompletionMode(tx, taskId);
}

function taskListWhere(
  eventId: string,
  statusFilter: TaskListStatusFilter,
  userFilter: TaskListUserFilter,
  memberId: string | null,
): Prisma.EventTaskWhereInput {
  if (userFilter.kind === "ALL") {
    return {
      eventId,
      ...(statusFilter === "OPEN"
        ? {
            status: {
              in: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
            },
          }
        : { status: EventTaskStatus.DONE }),
    };
  }

  if (!memberId) {
    return { eventId, id: { in: [] } };
  }

  if (statusFilter === "OPEN") {
    // §3.5: U is assignee, overall open; EACH: U not done; ANY: overall open + assignee.
    return {
      eventId,
      status: { in: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS] },
      OR: [
        {
          assigneeCompletionMode: EventTaskAssigneeCompletionMode.EACH,
          assignments: {
            some: { eventMemberId: memberId, doneAt: null },
          },
        },
        {
          assigneeCompletionMode: EventTaskAssigneeCompletionMode.ANY,
          assignments: { some: { eventMemberId: memberId } },
        },
      ],
    };
  }

  // User + Done: EACH — U's row done (may differ from overall); ANY — overall DONE + U assignee.
  return {
    eventId,
    OR: [
      {
        assigneeCompletionMode: EventTaskAssigneeCompletionMode.EACH,
        assignments: {
          some: { eventMemberId: memberId, doneAt: { not: null } },
        },
      },
      {
        assigneeCompletionMode: EventTaskAssigneeCompletionMode.ANY,
        status: EventTaskStatus.DONE,
        assignments: { some: { eventMemberId: memberId } },
      },
    ],
  };
}

export async function listEventTasks(
  eventId: string,
  params: {
    statusFilter: TaskListStatusFilter;
    userFilter: TaskListUserFilter;
  } = { statusFilter: "OPEN", userFilter: { kind: "ALL" } },
): Promise<ListEventTasksResult> {
  const r = await requireTaskBoardEnabled(eventId);
  if (!r.ok) return r;

  let memberId: string | null = null;
  if (params.userFilter.kind === "MEMBER") {
    const row = await prisma.eventMember.findFirst({
      where: { id: params.userFilter.eventMemberId, eventId },
      select: { id: true },
    });
    memberId = row?.id ?? null;
  }

  const where = taskListWhere(
    eventId,
    params.statusFilter,
    params.userFilter,
    memberId,
  );

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
  assigneeCompletionMode?: EventTaskAssigneeCompletionMode;
  /** Wall-time `YYYY-MM-DDTHH:mm` in `dueDateTimeZone`. */
  dueWall?: string | null;
  /** IANA zone for interpreting `dueWall`. Defaults to event start tz. */
  dueDateTimeZone?: string | null;
  assignedEventMemberIds?: string[] | null;
}): Promise<{ ok: true; taskId: string } | Err> {
  const r = await requireTaskBoardEnabled(params.eventId);
  if (!r.ok) return r;

  const title = normalizeTitle(params.title);
  if (!title) return { ok: false, error: "Title is required" };

  const notes = normalizeNotes(params.notes);
  const effectiveTz = normalizeTimeZone(
    params.dueDateTimeZone,
    r.row.event.startAtTimeZone,
  );
  const dueWall = String(params.dueWall ?? "").trim();
  const dueDate = dueWall ? parseEventDateTime(dueWall, effectiveTz) : null;
  const status = params.status ?? EventTaskStatus.TO_DO;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const memberIds = (params.assignedEventMemberIds ?? []).filter(Boolean);
      const rawMode =
        params.assigneeCompletionMode ?? EventTaskAssigneeCompletionMode.EACH;
      const assigneeMode =
        memberIds.length < 2
          ? EventTaskAssigneeCompletionMode.EACH
          : rawMode;

      const task = await tx.eventTask.create({
        data: {
          eventId: params.eventId,
          title,
          notes,
          dueDate,
          dueDateTimeZone: dueDate ? effectiveTz : null,
          status,
          assigneeCompletionMode: assigneeMode,
          createdByUserId: r.user.id,
        },
        select: { id: true },
      });
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
  assigneeCompletionMode?: EventTaskAssigneeCompletionMode;
  /** Wall-time `YYYY-MM-DDTHH:mm` in `dueDateTimeZone`. Empty/null clears due. */
  dueWall?: string | null;
  /** IANA zone for interpreting `dueWall`. Defaults to event start tz. */
  dueDateTimeZone?: string | null;
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
  const nextDue:
    | { dueDate: Date | null; dueDateTimeZone: string | null }
    | undefined =
    params.dueWall === undefined
      ? undefined
      : (() => {
          const effectiveTz = normalizeTimeZone(
            params.dueDateTimeZone,
            r.row.event.startAtTimeZone,
          );
          const wall = String(params.dueWall ?? "").trim();
          const dueDate = wall ? parseEventDateTime(wall, effectiveTz) : null;
          return {
            dueDate,
            dueDateTimeZone: dueDate ? effectiveTz : null,
          };
        })();

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
      const snap = await tx.eventTask.findUnique({
        where: { id: params.taskId },
        select: {
          assigneeCompletionMode: true,
          status: true,
          assignments: { select: { doneAt: true } },
        },
      });
      if (!snap) throw new Error("Task not found");

      const anyToEachReopen =
        params.assigneeCompletionMode ===
          EventTaskAssigneeCompletionMode.EACH &&
        snap.assigneeCompletionMode === EventTaskAssigneeCompletionMode.ANY &&
        snap.status === EventTaskStatus.DONE;

      if (anyToEachReopen) {
        await tx.eventTaskAssignment.updateMany({
          where: { taskId: params.taskId },
          data: { doneAt: null, doneByUserId: null },
        });
        for (const a of snap.assignments) {
          a.doneAt = null;
        }
      }

      let statusToApply = params.status;
      if (anyToEachReopen) {
        statusToApply = EventTaskStatus.TO_DO;
      }

      const nextMode =
        params.assigneeCompletionMode ?? snap.assigneeCompletionMode;
      const assigneeCount = snap.assignments.length;
      const effMode = effectiveAssigneeMode(assigneeCount, nextMode);

      if (statusToApply === EventTaskStatus.DONE) {
        if (
          effMode === EventTaskAssigneeCompletionMode.EACH &&
          assigneeCount > 0 &&
          snap.assignments.some((a) => a.doneAt == null)
        ) {
          throw new Error(
            "Cannot set Done until all assigned members have marked done.",
          );
        }
      }

      const data: Prisma.EventTaskUpdateInput = {};
      if (typeof nextTitle === "string") data.title = nextTitle;
      if (nextNotes !== undefined) data.notes = nextNotes;
      if (nextDue !== undefined) {
        data.dueDate = nextDue.dueDate;
        data.dueDateTimeZone = nextDue.dueDateTimeZone;
      }
      if (params.assigneeCompletionMode !== undefined) {
        data.assigneeCompletionMode = params.assigneeCompletionMode;
      }
      if (statusToApply !== undefined) data.status = statusToApply;

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

  if (before && params.dueWall !== undefined && before.assignments.length > 0) {
    const effectiveTz = normalizeTimeZone(
      params.dueDateTimeZone,
      r.row.event.startAtTimeZone,
    );
    const newDue = params.dueWall
      ? parseEventDateTime(params.dueWall, effectiveTz)
      : null;
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

    const taskSnap = await tx.eventTask.findUnique({
      where: { id: task.id },
      select: {
        assigneeCompletionMode: true,
        assignments: { select: { doneAt: true } },
      },
    });
    if (taskSnap) {
      const n = taskSnap.assignments.length;
      const eff = effectiveAssigneeMode(n, taskSnap.assigneeCompletionMode);
      if (
        eff === EventTaskAssigneeCompletionMode.ANY &&
        params.done &&
        n >= 2
      ) {
        await tx.eventTask.update({
          where: { id: task.id },
          data: { status: EventTaskStatus.DONE },
        });
      }
    }

    await recomputeOverallStatus(tx, task.id);
  });

  revalidatePath(`/dashboard/events/${task.eventId}`);
  return { ok: true };
}
