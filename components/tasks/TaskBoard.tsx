"use client";

import type { EventTaskStatus } from "@prisma/client";
import { DateTimeFields } from "@/components/common/DateTimeFields";
import {
  isoToDatetimeLocal,
  snapDatetimeLocalToFiveMinutes,
} from "@/lib/datetime-local";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  assignEveryoneToTask,
  assignMembersToTask,
  createEventTask,
  deleteEventTask,
  listEventTasks,
  setMyTaskDone,
  unassignMembersFromTask,
  updateEventTask,
  type EventTaskRow,
  type TaskMemberListItem,
  type TaskView,
} from "@/app/actions/event-tasks";

type TaskBoardProps = {
  eventId: string;
  currentUserId: string;
  members: TaskMemberListItem[];
};

type ScopeId = "ME" | "GROUP";
type BucketId = "OPEN" | "DONE";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}

function statusLabel(s: EventTaskStatus): string {
  return s === "TO_DO" ? "To‑do" : s === "IN_PROGRESS" ? "In progress" : "Done";
}

function statusPillClass(s: EventTaskStatus): string {
  if (s === "DONE")
    return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
  if (s === "IN_PROGRESS")
    return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
  return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
}

function viewFor(scope: ScopeId, bucket: BucketId): TaskView {
  if (scope === "GROUP") return bucket === "OPEN" ? "GROUP_OPEN" : "GROUP_DONE";
  return bucket === "OPEN" ? "USER_OPEN" : "USER_DONE";
}

function normalizeDueWall(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const snapped = snapDatetimeLocalToFiveMinutes(s);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(snapped) ? snapped : null;
}

type EditorState = {
  open: boolean;
  taskId: string | null;
  title: string;
  status: EventTaskStatus;
  dueDate: string;
  notes: string;
  assignees: Record<string, boolean>;
};

function emptyEditor(members: TaskMemberListItem[]): EditorState {
  const assignees: Record<string, boolean> = {};
  for (const m of members) assignees[m.membershipId] = false;
  return {
    open: false,
    taskId: null,
    title: "",
    status: "TO_DO",
    dueDate: "",
    notes: "",
    assignees,
  };
}

function editorFromTask(
  task: EventTaskRow,
  members: TaskMemberListItem[],
): EditorState {
  const base = emptyEditor(members);
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
    dueDate: task.dueDate ? isoToDatetimeLocal(task.dueDate) : "",
    notes: task.notes ?? "",
  };
}

export function TaskBoard({ eventId, currentUserId, members }: TaskBoardProps) {
  const meMembershipId = useMemo(
    () => members.find((m) => m.userId === currentUserId)?.membershipId ?? null,
    [members, currentUserId],
  );

  const [scope, setScope] = useState<ScopeId>("ME");
  const [bucket, setBucket] = useState<BucketId>("OPEN");
  const [tasks, setTasks] = useState<EventTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editor, setEditor] = useState<EditorState>(() => emptyEditor(members));

  const refresh = useCallback(
    (next?: { scope?: ScopeId; bucket?: BucketId }) => {
      const s = next?.scope ?? scope;
      const b = next?.bucket ?? bucket;
      const view = viewFor(s, b);

      setLoading(true);
      setError(null);
      startTransition(async () => {
        const r = await listEventTasks(eventId, { view });
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
    [eventId, scope, bucket],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openCreate() {
    setEditor(() => {
      const next = emptyEditor(members);
      next.open = true;
      return next;
    });
  }

  function openEdit(t: EventTaskRow) {
    setEditor(() => {
      const next = editorFromTask(t, members);
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
    setError(null);
    const title = editor.title.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }
    const dueWall = editor.dueDate ? normalizeDueWall(editor.dueDate) : null;
    if (editor.dueDate && !dueWall) {
      setError("Due time must be a valid date and time.");
      return;
    }
    // Convert wall-time (datetime-local) to an ISO instant using the browser's timezone.
    // Never send bare `YYYY-MM-DDTHH:mm` to the server (it would be interpreted in server TZ).
    const dueIso = dueWall ? new Date(dueWall).toISOString() : null;

    const assigneeIds = selectedAssigneeIds();

    startTransition(async () => {
      if (!editor.taskId) {
        const r = await createEventTask({
          eventId,
          title,
          status: editor.status,
          dueDate: dueIso,
          notes: editor.notes || null,
          assignedEventMemberIds: assigneeIds,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setEditor((e) => ({ ...e, open: false }));
        refresh();
        return;
      }

      const taskId = editor.taskId;
      const r = await updateEventTask({
        taskId,
        title,
        status: editor.status,
        dueDate: dueIso,
        notes: editor.notes || null,
      });
      if (!r.ok) {
        setError(r.error);
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
          setError(a.error);
          return;
        }
      }
      if (toRemove.length) {
        const u = await unassignMembersFromTask({
          taskId,
          eventMemberIds: toRemove,
        });
        if (!u.ok) {
          setError(u.error);
          return;
        }
      }

      setEditor((e) => ({ ...e, open: false }));
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

      <div className="flex flex-wrap gap-2">
        {(["ME", "GROUP"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={
              scope === s
                ? "rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                : "rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            }
          >
            {s === "ME" ? "Me" : "Group"}
          </button>
        ))}
        <div className="mx-1 w-px bg-gray-200 dark:bg-gray-700" />
        {(["OPEN", "DONE"] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBucket(b)}
            className={
              bucket === b
                ? "rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                : "rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            }
          >
            {b === "OPEN" ? "Open" : "Done"}
          </button>
        ))}
      </div>

      {error && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

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
                          isoToDatetimeLocal(t.dueDate).replace("T", " ")
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
                                  a.doneAt
                                    ? "inline-flex size-7 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-200"
                                    : "inline-flex size-7 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                                }
                                title={`${a.eventMember.name}${a.doneAt ? " (done)" : ""}`}
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
                              Done for me
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
                className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                onClick={() => setEditor((e) => ({ ...e, open: false }))}
              >
                Close
              </button>
            </div>

            <div className="space-y-6 px-5 py-4">
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
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                  >
                    <option value="TO_DO">To‑do</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Due time (optional)
                  </label>
                  <div className="mt-1">
                    <DateTimeFields
                      id="task-due"
                      label="Due"
                      value={editor.dueDate}
                      disabled={isPending}
                      onChange={(next) =>
                        setEditor((s) => ({ ...s, dueDate: next }))
                      }
                    />
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
                        const taskId = editor.taskId;
                        if (!taskId) return;
                        startTransition(async () => {
                          const r = await assignEveryoneToTask(taskId);
                          if (!r.ok) {
                            setError(r.error);
                            return;
                          }
                          refresh();
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
                onClick={() => setEditor((e) => ({ ...e, open: false }))}
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
          </div>
        </div>
      )}
    </div>
  );
}
