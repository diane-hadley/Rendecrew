"use client";

import type { EventTaskStatus } from "@prisma/client";
import { DateTimeFields } from "@/components/common/DateTimeFields";
import { TimeZonePickerModal } from "@/components/common/TimeZonePickerModal";
import { snapDatetimeLocalToFiveMinutes } from "@/lib/datetime-local";
import {
  normalizeTimeZone,
  utcToWallDatetimeLocal,
} from "@/lib/event-datetime";
import { useDismissOnOutsidePointer } from "@/hooks/use-dismiss-on-outside-pointer";
import { DEFAULT_TASK_LIST_OPEN_STATUS_FILTER } from "@/lib/task-list-filters";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  assignMembersToTask,
  createEventTask,
  deleteEventTask,
  listEventTasks,
  setMyTaskDone,
  unassignMembersFromTask,
  updateEventTask,
  type EventTaskAssigneeCompletionMode,
  type EventTaskRow,
  type TaskListStatusFilter,
  type TaskListUserFilter,
  type TaskMemberListItem,
} from "@/app/actions/event-tasks";

type TaskBoardProps = {
  eventId: string;
  currentUserId: string;
  members: TaskMemberListItem[];
  /** Default tz for interpreting due date wall times. */
  defaultTimeZone: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}

function statusLabel(s: EventTaskStatus): string {
  return s === "TO_DO" ? "To‑do" : s === "IN_PROGRESS" ? "In progress" : "Done";
}

const ALL_TASK_STATUSES: EventTaskStatus[] = ["TO_DO", "IN_PROGRESS", "DONE"];

function statusPillClass(s: EventTaskStatus): string {
  if (s === "DONE")
    return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
  if (s === "IN_PROGRESS")
    return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
  return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
}

function normalizeDueWall(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const snapped = snapDatetimeLocalToFiveMinutes(s);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(snapped) ? snapped : null;
}

function formatTaskDueForTable(
  dueDate: string,
  dueTimeZone: string | null,
  defaultTimeZone: string,
): string {
  return (
    utcToWallDatetimeLocal(dueDate, dueTimeZone ?? defaultTimeZone) || ""
  ).replace("T", " ");
}

type EditorState = {
  open: boolean;
  taskId: string | null;
  title: string;
  status: EventTaskStatus;
  assigneeCompletionMode: EventTaskAssigneeCompletionMode;
  dueDate: string;
  dueTimeZone: string;
  notes: string;
  assignees: Record<string, boolean>;
};

function emptyEditor(
  members: TaskMemberListItem[],
  defaultTimeZone: string,
): EditorState {
  const assignees: Record<string, boolean> = {};
  for (const m of members) assignees[m.membershipId] = false;
  return {
    open: false,
    taskId: null,
    title: "",
    status: "TO_DO",
    assigneeCompletionMode: "EACH",
    dueDate: "",
    dueTimeZone: defaultTimeZone,
    notes: "",
    assignees,
  };
}

function editorFromTask(
  task: EventTaskRow,
  members: TaskMemberListItem[],
  defaultTimeZone: string,
): EditorState {
  const base = emptyEditor(members, defaultTimeZone);
  const assigned = new Set(
    task.assignments.map((a) => a.eventMember.membershipId),
  );
  for (const m of members)
    base.assignees[m.membershipId] = assigned.has(m.membershipId);
  return {
    ...base,
    taskId: task.id,
    title: task.title,
    status: task.status,
    assigneeCompletionMode: task.assigneeCompletionMode,
    dueDate:
      task.dueDate && task.dueDateTimeZone
        ? utcToWallDatetimeLocal(task.dueDate, task.dueDateTimeZone)
        : task.dueDate
          ? utcToWallDatetimeLocal(task.dueDate, defaultTimeZone)
          : "",
    dueTimeZone: task.dueDateTimeZone ?? defaultTimeZone,
    notes: task.notes ?? "",
  };
}

export function TaskBoard({
  eventId,
  currentUserId,
  members,
  defaultTimeZone,
}: TaskBoardProps) {
  const meMembershipId = useMemo(
    () => members.find((m) => m.userId === currentUserId)?.membershipId ?? null,
    [members, currentUserId],
  );

  const [userFilter, setUserFilter] = useState<TaskListUserFilter>(() => {
    const me = members.find((m) => m.userId === currentUserId)?.membershipId;
    return me ? { kind: "MEMBERS", eventMemberIds: [me] } : { kind: "ALL" };
  });
  const [statusFilter, setStatusFilter] = useState<TaskListStatusFilter>(
    DEFAULT_TASK_LIST_OPEN_STATUS_FILTER,
  );
  const [tasks, setTasks] = useState<EventTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editor, setEditor] = useState<EditorState>(() =>
    emptyEditor(members, defaultTimeZone),
  );
  const [tzModalOpen, setTzModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  useDismissOnOutsidePointer(userMenuRef, userMenuOpen, setUserMenuOpen);
  useDismissOnOutsidePointer(statusMenuRef, statusMenuOpen, setStatusMenuOpen);

  const allMemberIds = useMemo(
    () => members.map((m) => m.membershipId),
    [members],
  );

  const selectedUserIds = useMemo(() => {
    if (userFilter.kind === "ALL") return [];
    return userFilter.eventMemberIds;
  }, [userFilter]);

  /** Whole-event slice (includes unassigned tasks); same as “everyone selected”. */
  const isEveryoneSelected = useMemo(() => {
    if (userFilter.kind === "ALL") return true;
    if (allMemberIds.length === 0) return false;
    const set = new Set(selectedUserIds);
    return allMemberIds.every((id) => set.has(id));
  }, [userFilter.kind, allMemberIds, selectedUserIds]);

  /** Full member selection must query as ALL so unassigned tasks are included. */
  const userFilterForList = useMemo((): TaskListUserFilter => {
    if (userFilter.kind === "ALL") return userFilter;
    if (isEveryoneSelected) return { kind: "ALL" };
    return userFilter;
  }, [userFilter, isEveryoneSelected]);

  function applyUserMemberSelection(nextIds: string[]) {
    const uniq = Array.from(new Set(nextIds.filter(Boolean)));
    if (uniq.length === 0) {
      if (meMembershipId) {
        setUserFilter({ kind: "MEMBERS", eventMemberIds: [meMembershipId] });
      } else if (allMemberIds.length) {
        setUserFilter({ kind: "MEMBERS", eventMemberIds: [allMemberIds[0]!] });
      } else {
        setUserFilter({ kind: "ALL" });
      }
      return;
    }
    if (
      allMemberIds.length > 0 &&
      uniq.length === allMemberIds.length &&
      allMemberIds.every((id) => uniq.includes(id))
    ) {
      setUserFilter({ kind: "ALL" });
      return;
    }
    setUserFilter({ kind: "MEMBERS", eventMemberIds: uniq });
  }

  const selectedStatuses = useMemo((): EventTaskStatus[] => {
    if (statusFilter.kind === "ALL") return [...ALL_TASK_STATUSES];
    return statusFilter.statuses;
  }, [statusFilter]);

  const isAllStatusesSelected = useMemo(() => {
    if (statusFilter.kind === "ALL") return true;
    const s = new Set(statusFilter.statuses);
    return ALL_TASK_STATUSES.every((x) => s.has(x));
  }, [statusFilter]);

  function applyStatusSelection(next: EventTaskStatus[]) {
    const uniq = Array.from(new Set(next.filter(Boolean)));
    if (uniq.length === 0) {
      setStatusFilter(DEFAULT_TASK_LIST_OPEN_STATUS_FILTER);
      return;
    }
    if (
      uniq.length === ALL_TASK_STATUSES.length &&
      ALL_TASK_STATUSES.every((s) => uniq.includes(s))
    ) {
      setStatusFilter({ kind: "ALL" });
      return;
    }
    setStatusFilter({ kind: "SET", statuses: uniq });
  }

  function statusFilterTriggerLabel(): string {
    if (statusFilter.kind === "ALL") return "All";
    const s = statusFilter.statuses;
    if (
      s.length === 2 &&
      s.includes("TO_DO") &&
      s.includes("IN_PROGRESS") &&
      !s.includes("DONE")
    ) {
      return "Open";
    }
    if (s.length === 1) return statusLabel(s[0]!);
    return `${s.length} selected`;
  }

  const refresh = useCallback(
    (next?: {
      userFilter?: TaskListUserFilter;
      statusFilter?: TaskListStatusFilter;
    }) => {
      const uf = next?.userFilter ?? userFilterForList;
      const sf = next?.statusFilter ?? statusFilter;

      setLoading(true);
      setError(null);
      startTransition(async () => {
        const r = await listEventTasks(eventId, {
          statusFilter: sf,
          userFilter: uf,
        });
        if (!r.ok) {
          setError(r.error);
          setTasks([]);
          setLoading(false);
          return;
        }
        setTasks(r.tasks);
        setLoading(false);
      });
    },
    [eventId, userFilterForList, statusFilter],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const editorAlert = editor.open ? editorError : null;
  const pageBanner = !editor.open ? error : null;

  function closeEditor() {
    setEditorError(null);
    setEditor((e) => ({ ...e, open: false }));
  }

  function openCreate() {
    setEditorError(null);
    setEditor(() => {
      const next = emptyEditor(members, defaultTimeZone);
      next.open = true;
      return next;
    });
  }

  function openEdit(t: EventTaskRow) {
    setEditorError(null);
    setEditor(() => {
      const next = editorFromTask(t, members, defaultTimeZone);
      next.open = true;
      return next;
    });
  }

  function selectedAssigneeIds(): string[] {
    return Object.entries(editor.assignees)
      .filter(([, checked]) => checked)
      .map(([id]) => id);
  }

  async function saveTask() {
    setEditorError(null);
    const title = editor.title.trim();
    if (!title) {
      setEditorError("Title is required.");
      return;
    }
    const dueWall = editor.dueDate ? normalizeDueWall(editor.dueDate) : null;
    if (editor.dueDate && !dueWall) {
      setEditorError("Due time must be a valid date and time.");
      return;
    }
    const dueTz = normalizeTimeZone(editor.dueTimeZone, defaultTimeZone);

    const assigneeIds = selectedAssigneeIds();
    const completionMode: EventTaskAssigneeCompletionMode =
      assigneeIds.length >= 2 ? editor.assigneeCompletionMode : "EACH";

    startTransition(async () => {
      if (!editor.taskId) {
        const r = await createEventTask({
          eventId,
          title,
          status: editor.status,
          assigneeCompletionMode: completionMode,
          dueWall,
          dueDateTimeZone: dueWall ? dueTz : null,
          notes: editor.notes || null,
          assignedEventMemberIds: assigneeIds,
        });
        if (!r.ok) {
          setEditorError(r.error);
          return;
        }
        closeEditor();
        refresh();
        return;
      }

      const taskId = editor.taskId;
      const r = await updateEventTask({
        taskId,
        title,
        status: editor.status,
        assigneeCompletionMode: completionMode,
        dueWall,
        dueDateTimeZone: dueWall ? dueTz : null,
        notes: editor.notes || null,
      });
      if (!r.ok) {
        setEditorError(r.error);
        return;
      }

      const existing = tasks.find((t) => t.id === taskId);
      const prevAssigned = new Set(
        (existing?.assignments ?? []).map((a) => a.eventMember.membershipId),
      );
      const nextAssigned = new Set(assigneeIds);

      const toAdd = assigneeIds.filter((id) => !prevAssigned.has(id));
      const toRemove = Array.from(prevAssigned).filter(
        (id) => !nextAssigned.has(id),
      );

      if (toAdd.length) {
        const a = await assignMembersToTask({ taskId, eventMemberIds: toAdd });
        if (!a.ok) {
          setEditorError(a.error);
          return;
        }
      }
      if (toRemove.length) {
        const u = await unassignMembersFromTask({
          taskId,
          eventMemberIds: toRemove,
        });
        if (!u.ok) {
          setEditorError(u.error);
          return;
        }
      }

      closeEditor();
      refresh();
    });
  }

  async function doDelete(taskId: string) {
    if (!confirm("Delete this task?")) return;
    startTransition(async () => {
      const r = await deleteEventTask(taskId);
      if (!r.ok) setError(r.error);
      refresh();
    });
  }

  async function toggleMyDone(taskId: string, done: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await setMyTaskDone({ taskId, done });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800">
        <div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Tasks
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Keep track of to‑dos for you and the group.
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={isPending}
        >
          Add task
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            User
          </span>
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              className="inline-flex w-full min-w-[14rem] items-center justify-between gap-3 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <span className="truncate">
                {isEveryoneSelected
                  ? "All"
                  : selectedUserIds.length === 1 &&
                      selectedUserIds[0] === meMembershipId
                    ? "Me"
                    : selectedUserIds.length
                      ? `${selectedUserIds.length} selected`
                      : "Choose…"}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-300">
                ▾
              </span>
            </button>

            {userMenuOpen ? (
              <div className="absolute left-0 z-20 mt-2 w-full rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                  onClick={() => {
                    if (isEveryoneSelected) {
                      applyUserMemberSelection(
                        meMembershipId
                          ? [meMembershipId]
                          : allMemberIds.slice(0, 1),
                      );
                    } else {
                      setUserFilter({ kind: "ALL" });
                    }
                  }}
                  disabled={allMemberIds.length === 0}
                >
                  <span className="truncate">All</span>
                  <span className="text-sm">
                    {isEveryoneSelected ? "✓" : ""}
                  </span>
                </button>

                <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />

                {members
                  .slice()
                  .sort((a, b) => {
                    if (a.membershipId === meMembershipId) return -1;
                    if (b.membershipId === meMembershipId) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((m) => {
                    const checked =
                      userFilter.kind === "ALL" ||
                      selectedUserIds.includes(m.membershipId);
                    return (
                      <button
                        key={m.membershipId}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                        onClick={() => {
                          if (userFilter.kind === "ALL") {
                            applyUserMemberSelection([m.membershipId]);
                            return;
                          }
                          const next = new Set(selectedUserIds);
                          if (next.has(m.membershipId))
                            next.delete(m.membershipId);
                          else next.add(m.membershipId);
                          applyUserMemberSelection(Array.from(next));
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex size-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                            {initials(m.name)}
                          </span>
                          <span className="min-w-0 truncate">
                            {m.membershipId === meMembershipId ? "Me" : m.name}
                          </span>
                        </span>
                        <span className="text-sm">{checked ? "✓" : ""}</span>
                      </button>
                    );
                  })}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            Status
          </span>
          <div className="relative" ref={statusMenuRef}>
            <button
              type="button"
              className="inline-flex w-full min-w-[14rem] items-center justify-between gap-3 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
              onClick={() => setStatusMenuOpen((v) => !v)}
            >
              <span className="truncate">{statusFilterTriggerLabel()}</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">
                ▾
              </span>
            </button>

            {statusMenuOpen ? (
              <div className="absolute left-0 z-20 mt-2 w-full rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                  onClick={() => {
                    if (isAllStatusesSelected) {
                      applyStatusSelection(["TO_DO", "IN_PROGRESS"]);
                    } else {
                      setStatusFilter({ kind: "ALL" });
                    }
                  }}
                >
                  <span className="truncate">All</span>
                  <span className="text-sm">
                    {isAllStatusesSelected ? "✓" : ""}
                  </span>
                </button>

                <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />

                {ALL_TASK_STATUSES.map((st) => {
                  const checked = selectedStatuses.includes(st);
                  return (
                    <button
                      key={st}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                      onClick={() => {
                        if (statusFilter.kind === "ALL") {
                          applyStatusSelection([st]);
                          return;
                        }
                        const next = new Set(statusFilter.statuses);
                        if (next.has(st)) next.delete(st);
                        else next.add(st);
                        applyStatusSelection(Array.from(next));
                      }}
                    >
                      <span className="truncate">{statusLabel(st)}</span>
                      <span className="text-sm">{checked ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {pageBanner ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {pageBanner}
        </p>
      ) : null}

      {loading ? (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Loading tasks…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                  Task
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                  Due
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                  Assigned
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {tasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-sm text-gray-600 dark:text-gray-300"
                  >
                    No tasks.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => {
                  const myAssignment = meMembershipId
                    ? t.assignments.find(
                        (a) => a.eventMember.membershipId === meMembershipId,
                      )
                    : null;
                  const myDone = myAssignment?.doneAt != null;
                  const hasAssignees = t.assignments.length > 0;
                  const showMyToggle = myAssignment != null;
                  const multiAssignee = t.assignments.length >= 2;
                  const completionMode: EventTaskAssigneeCompletionMode =
                    !multiAssignee ? "EACH" : t.assigneeCompletionMode;
                  const isAnyMode = completionMode === "ANY";

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-gray-50/70 dark:hover:bg-gray-900/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {t.title}
                        </div>
                        {t.notes?.trim() ? (
                          <div className="mt-1 whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300">
                            {t.notes}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClass(
                            t.status,
                          )}`}
                        >
                          {statusLabel(t.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                        {t.dueDate ? (
                          formatTaskDueForTable(
                            t.dueDate,
                            t.dueDateTimeZone,
                            defaultTimeZone,
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {hasAssignees ? (
                            t.assignments.map((a) => (
                              <span
                                key={a.id}
                                className={
                                  isAnyMode
                                    ? "inline-flex size-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                                    : a.doneAt
                                      ? "inline-flex size-7 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-200"
                                      : "inline-flex size-7 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                                }
                                title={
                                  isAnyMode
                                    ? a.eventMember.name
                                    : `${a.eventMember.name}${a.doneAt ? " (done)" : ""}`
                                }
                              >
                                {initials(a.eventMember.name)}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Unassigned
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {showMyToggle ? (
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-100">
                              <input
                                type="checkbox"
                                checked={myDone}
                                disabled={isPending}
                                onChange={(e) =>
                                  toggleMyDone(t.id, e.target.checked)
                                }
                              />
                              {isAnyMode && multiAssignee
                                ? "Mark complete"
                                : "Done for me"}
                            </label>
                          ) : null}
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => openEdit(t)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-900 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => doDelete(t.id)}
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 shadow-sm hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {editor.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {editor.taskId ? "Edit task" : "Add task"}
              </div>
              <button
                type="button"
                aria-label="Close"
                className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                onClick={closeEditor}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="size-5"
                  aria-hidden
                >
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 px-5 py-4">
              {editorAlert ? (
                <p
                  className="text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {editorAlert}
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Title
                  </label>
                  <input
                    value={editor.title}
                    onChange={(e) =>
                      setEditor((s) => ({ ...s, title: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                    placeholder="Book groceries"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Status
                  </label>
                  <select
                    value={editor.status}
                    onChange={(e) =>
                      setEditor((s) => ({
                        ...s,
                        status: e.target.value as EventTaskStatus,
                      }))
                    }
                    className="mt-1 w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                  >
                    <option value="TO_DO">To‑do</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Due
                  </label>
                  <div className="mt-1">
                    <DateTimeFields
                      id="task-due"
                      label=""
                      hideSubLabels
                      value={editor.dueDate}
                      disabled={isPending}
                      onChange={(next) =>
                        setEditor((s) => ({ ...s, dueDate: next }))
                      }
                    />
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={isPending}
                      className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                      onClick={() => setTzModalOpen(true)}
                    >
                      Time zone: {editor.dueTimeZone}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Assigned to (optional)
                  </label>
                  {editor.taskId ? (
                    <button
                      type="button"
                      disabled={isPending}
                      className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                      onClick={() => {
                        setEditorError(null);
                        setEditor((s) => {
                          const nextAssignees = { ...s.assignees };
                          for (const m of members) {
                            nextAssignees[m.membershipId] = true;
                          }
                          return { ...s, assignees: nextAssignees };
                        });
                      }}
                    >
                      Assign to everyone
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {members.map((m) => (
                    <label
                      key={m.membershipId}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={editor.assignees[m.membershipId] ?? false}
                        onChange={(e) =>
                          setEditor((s) => ({
                            ...s,
                            assignees: {
                              ...s.assignees,
                              [m.membershipId]: e.target.checked,
                            },
                          }))
                        }
                      />
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                        {initials(m.name)}
                      </span>
                      <span className="min-w-0 truncate">{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {Object.values(editor.assignees).filter(Boolean).length >= 2 ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Completion
                  </div>
                  <div className="mt-3 space-y-2">
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                      <input
                        type="radio"
                        name="task-assignee-mode"
                        className="mt-1"
                        checked={editor.assigneeCompletionMode === "EACH"}
                        disabled={isPending}
                        onChange={() =>
                          setEditor((s) => ({
                            ...s,
                            assigneeCompletionMode: "EACH",
                          }))
                        }
                      />
                      <span>
                        <span className="font-medium">Each</span> — everyone
                        must mark done
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                      <input
                        type="radio"
                        name="task-assignee-mode"
                        className="mt-1"
                        checked={editor.assigneeCompletionMode === "ANY"}
                        disabled={isPending}
                        onChange={() =>
                          setEditor((s) => ({
                            ...s,
                            assigneeCompletionMode: "ANY",
                          }))
                        }
                      />
                      <span>
                        <span className="font-medium">Any</span> — one person
                        can complete for everyone
                      </span>
                    </label>
                  </div>
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  Notes (optional)
                </label>
                <textarea
                  value={editor.notes}
                  onChange={(e) =>
                    setEditor((s) => ({ ...s, notes: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                  rows={4}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTask}
                disabled={isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>

            <TimeZonePickerModal
              open={tzModalOpen}
              title="Task time zone"
              startLabel="Due time zone"
              endLabel="Due time zone"
              allowSeparateStartEnd={false}
              startTimeZone={editor.dueTimeZone}
              endTimeZone={editor.dueTimeZone}
              onClose={() => setTzModalOpen(false)}
              onApply={({ startTimeZone }) => {
                setEditor((s) => ({ ...s, dueTimeZone: startTimeZone }));
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
