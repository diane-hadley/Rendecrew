import { EventTaskStatus } from "@prisma/client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EventTaskRow,
  TaskMemberListItem,
} from "@/app/actions/event-tasks";
import { TaskBoard } from "./TaskBoard";

const listEventTasks = vi.fn();
const createEventTask = vi.fn();
const updateEventTask = vi.fn();
const deleteEventTask = vi.fn();
const assignEveryoneToTask = vi.fn();
const assignMembersToTask = vi.fn();
const unassignMembersFromTask = vi.fn();
const setMyTaskDone = vi.fn();

vi.mock("@/app/actions/event-tasks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/actions/event-tasks")>();
  return {
    ...actual,
    listEventTasks: (...a: unknown[]) => listEventTasks(...a),
    createEventTask: (...a: unknown[]) => createEventTask(...a),
    updateEventTask: (...a: unknown[]) => updateEventTask(...a),
    deleteEventTask: (...a: unknown[]) => deleteEventTask(...a),
    assignEveryoneToTask: (...a: unknown[]) => assignEveryoneToTask(...a),
    assignMembersToTask: (...a: unknown[]) => assignMembersToTask(...a),
    unassignMembersFromTask: (...a: unknown[]) => unassignMembersFromTask(...a),
    setMyTaskDone: (...a: unknown[]) => setMyTaskDone(...a),
  };
});

vi.mock("@/components/common/DateTimeFields", () => ({
  DateTimeFields: () => <input aria-label="Due (stub)" readOnly />,
}));

vi.mock("@/components/common/TimeZonePickerModal", () => ({
  TimeZonePickerModal: () => null,
}));

const members: TaskMemberListItem[] = [
  {
    membershipId: "m1",
    userId: "u1",
    name: "Casey Organizer",
    email: "c@example.com",
  },
  {
    membershipId: "m2",
    userId: "u2",
    name: "Dana Member",
    email: "d@example.com",
  },
];

function sampleTask(overrides: Partial<EventTaskRow> = {}): EventTaskRow {
  return {
    id: "t1",
    eventId: "e1",
    title: "Buy ice",
    notes: null,
    status: "TO_DO",
    assigneeCompletionMode: "EACH",
    dueDate: null,
    dueDateTimeZone: null,
    sortOrder: 0,
    createdByUserId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    assignments: [
      {
        id: "a1",
        eventMember: members[0]!,
        doneAt: null,
      },
    ],
    ...overrides,
  };
}

function okList(tasks: EventTaskRow[]) {
  return {
    ok: true as const,
    me: { userId: "u1", eventMemberId: "m1" },
    tasks,
  };
}

/** Filter row: first ▾ trigger is User, second is Status. */
function filterDropdownTriggers() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.textContent?.includes("▾"));
}

describe("TaskBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listEventTasks.mockResolvedValue(okList([sampleTask()]));
    createEventTask.mockResolvedValue({ ok: true as const, taskId: "t-new" });
    updateEventTask.mockResolvedValue({ ok: true as const });
    deleteEventTask.mockResolvedValue({ ok: true as const });
    assignEveryoneToTask.mockResolvedValue({ ok: true as const });
    assignMembersToTask.mockResolvedValue({ ok: true as const });
    unassignMembersFromTask.mockResolvedValue({ ok: true as const });
    setMyTaskDone.mockResolvedValue({ ok: true as const });
  });

  it("loads tasks on mount with default Me + Open filters", async () => {
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="America/Los_Angeles"
      />,
    );

    expect(await screen.findByText("Buy ice")).toBeInTheDocument();
    expect(listEventTasks).toHaveBeenCalledWith("e1", {
      statusFilter: {
        kind: "SET",
        statuses: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
      },
      userFilter: { kind: "MEMBERS", eventMemberIds: ["m1"] },
    });
  });

  it("shows an error when listing fails", async () => {
    listEventTasks.mockResolvedValue({
      ok: false as const,
      error: "Task board is offline",
    });
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Task board is offline",
    );
  });

  it("shows empty state when there are no tasks", async () => {
    listEventTasks.mockResolvedValue(okList([]));
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    expect(await screen.findByText("No tasks.")).toBeInTheDocument();
  });

  it("refetches with All users after choosing All in the user menu", async () => {
    const user = userEvent.setup();
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("Buy ice");

    const [userTrigger] = filterDropdownTriggers();
    await user.click(userTrigger);
    await user.click(screen.getByRole("button", { name: /^All$/ }));

    await waitFor(() => expect(listEventTasks).toHaveBeenCalledTimes(2));
    expect(listEventTasks).toHaveBeenLastCalledWith("e1", {
      statusFilter: {
        kind: "SET",
        statuses: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
      },
      userFilter: { kind: "ALL" },
    });
  });

  it("refetches with Done-only status after narrowing from All statuses", async () => {
    const user = userEvent.setup();
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("Buy ice");

    const [, statusTrigger] = filterDropdownTriggers();
    await user.click(statusTrigger);
    await user.click(screen.getByRole("button", { name: /^All$/ }));
    await waitFor(() => expect(listEventTasks).toHaveBeenCalledTimes(2));

    // Status menu is still open; avoid toggling the trigger (that would close it).
    await user.click(screen.getByRole("button", { name: /Done✓/ }));

    await waitFor(() => expect(listEventTasks).toHaveBeenCalledTimes(3));
    expect(listEventTasks).toHaveBeenLastCalledWith("e1", {
      statusFilter: { kind: "SET", statuses: [EventTaskStatus.DONE] },
      userFilter: { kind: "MEMBERS", eventMemberIds: ["m1"] },
    });
  });

  it("creates a task and refreshes the list", async () => {
    const user = userEvent.setup();
    listEventTasks
      .mockResolvedValueOnce(okList([]))
      .mockResolvedValue(
        okList([sampleTask({ id: "t-new", title: "New one" })]),
      );

    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("No tasks.");

    await user.click(screen.getByRole("button", { name: "Add task" }));
    const titleInput = screen.getByPlaceholderText("Book groceries");
    await user.type(titleInput, "New one");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createEventTask).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "e1",
          title: "New one",
        }),
      );
    });
    expect(await screen.findByText("New one")).toBeInTheDocument();
  });

  it("shows title required when saving an empty new task", async () => {
    const user = userEvent.setup();
    listEventTasks.mockResolvedValue(okList([]));
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("No tasks.");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(createEventTask).not.toHaveBeenCalled();
  });

  it("toggles Done for me via setMyTaskDone", async () => {
    const user = userEvent.setup();
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("Buy ice");

    const row = screen.getByText("Buy ice").closest("tr");
    expect(row).not.toBeNull();
    const doneCb = within(row!).getByRole("checkbox", { name: /Done for me/i });
    await user.click(doneCb);

    await waitFor(() => {
      expect(setMyTaskDone).toHaveBeenCalledWith({
        taskId: "t1",
        done: true,
      });
    });
  });

  it("deletes a task after confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("Buy ice");

    const row = screen.getByText("Buy ice").closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row!).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteEventTask).toHaveBeenCalledWith("t1");
    });
    confirmSpy.mockRestore();
  });

  it("defaults to All users when current user has no membership", async () => {
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u-unknown"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("Buy ice");
    expect(listEventTasks).toHaveBeenCalledWith("e1", {
      statusFilter: {
        kind: "SET",
        statuses: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
      },
      userFilter: { kind: "ALL" },
    });
  });

  it("updates a task from the edit dialog", async () => {
    const user = userEvent.setup();
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("Buy ice");
    const row = screen.getByText("Buy ice").closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row!).getByRole("button", { name: "Edit" }));

    const titleInput = screen.getByDisplayValue("Buy ice");
    await user.clear(titleInput);
    await user.type(titleInput, "Restocked");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateEventTask).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "t1", title: "Restocked" }),
      );
    });
  });

  it("does not delete when confirm is dismissed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(
        <TaskBoard
          eventId="e1"
          currentUserId="u1"
          members={members}
          defaultTimeZone="UTC"
        />,
      );
      await screen.findByText("Buy ice");
      const row = screen.getByText("Buy ice").closest("tr");
      expect(row).not.toBeNull();
      await user.click(within(row!).getByRole("button", { name: "Delete" }));
      expect(deleteEventTask).not.toHaveBeenCalled();
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("closes the create dialog from Close", async () => {
    const user = userEvent.setup();
    listEventTasks.mockResolvedValue(okList([]));
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("No tasks.");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByPlaceholderText("Book groceries")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByPlaceholderText("Book groceries"),
    ).not.toBeInTheDocument();
  });

  it("assigns everyone from the edit dialog", async () => {
    const user = userEvent.setup();
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("Buy ice");
    const row = screen.getByText("Buy ice").closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row!).getByRole("button", { name: "Edit" }));
    await user.click(
      screen.getByRole("button", { name: "Assign to everyone" }),
    );
    await waitFor(() => {
      expect(assignEveryoneToTask).toHaveBeenCalledWith("t1");
    });
  });

  it("adds a second member to the user filter and refetches", async () => {
    const user = userEvent.setup();
    render(
      <TaskBoard
        eventId="e1"
        currentUserId="u1"
        members={members}
        defaultTimeZone="UTC"
      />,
    );
    await screen.findByText("Buy ice");
    expect(listEventTasks).toHaveBeenCalledTimes(1);

    const [userTrigger] = filterDropdownTriggers();
    await user.click(userTrigger);
    const danaRow = screen.getByRole("button", { name: /Dana Member/i });
    await user.click(danaRow);

    await waitFor(() => expect(listEventTasks).toHaveBeenCalledTimes(2));
    // Selecting every member is sent to the server as ALL (includes unassigned tasks).
    expect(listEventTasks).toHaveBeenLastCalledWith("e1", {
      statusFilter: {
        kind: "SET",
        statuses: [EventTaskStatus.TO_DO, EventTaskStatus.IN_PROGRESS],
      },
      userFilter: { kind: "ALL" },
    });
  });
});
