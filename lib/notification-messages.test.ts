import { describe, expect, it } from "vitest";
import { formatNotificationMessage } from "./notification-messages";
import type { NotificationMetadata } from "./notifications";

const base = (over: Partial<Parameters<typeof formatNotificationMessage>[0]>) =>
  formatNotificationMessage({
    kind: "event.member_added",
    metadata: {},
    actorName: "Alex",
    actorUserId: "a1",
    timeZone: "America/Los_Angeles",
    ...over,
  });

describe("formatNotificationMessage", () => {
  it("event.member_added", () => {
    expect(
      base({
        kind: "event.member_added",
        metadata: { eventTitle: "Campout" } as NotificationMetadata,
      }),
    ).toBe(`Alex added you to “Campout”.`);
  });

  it("tasks.assignment_changed assigned", () => {
    expect(
      base({
        kind: "tasks.assignment_changed",
        metadata: {
          taskTitle: "Tents",
          eventTitle: "Beach",
        } as NotificationMetadata,
      }),
    ).toBe(`Alex assigned you to “Tents” in “Beach”.`);
  });

  it("tasks.assignment_changed unassigned", () => {
    expect(
      base({
        kind: "tasks.assignment_changed",
        metadata: {
          taskTitle: "Tents",
          change: "unassigned",
          eventTitle: "Beach",
        } as NotificationMetadata,
      }),
    ).toBe(`Alex removed you from the task “Tents” in “Beach”.`);
  });

  it("tasks.due_date_changed formats dates in user zone", () => {
    expect(
      base({
        kind: "tasks.due_date_changed",
        metadata: {
          taskTitle: "Dishes",
          eventTitle: "Beach",
          dueDateFrom: "2026-01-10",
          dueDateTo: "2026-01-20",
        } as NotificationMetadata,
      }),
    ).toBe(
      `Alex changed the due date for “Dishes” in “Beach” from January 10, 2026 to January 20, 2026.`,
    );
  });

  it("tasks.due_date_changed uses no date set when a side is null", () => {
    expect(
      base({
        kind: "tasks.due_date_changed",
        metadata: {
          taskTitle: "Tents",
          eventTitle: "Beach",
          dueDateFrom: "2026-01-10",
          dueDateTo: null,
        } as NotificationMetadata,
      }),
    ).toBe(
      `Alex changed the due date for “Tents” in “Beach” from January 10, 2026 to no date set.`,
    );
  });

  it("rides.passenger_joined_my_car self-join uses passenger", () => {
    expect(
      base({
        kind: "rides.passenger_joined_my_car",
        actorName: "Sam",
        actorUserId: "pass1",
        metadata: {
          eventTitle: "Beach",
          passengerUserId: "pass1",
          passengerName: "Sam",
          leg: "TO_EVENT",
        } as NotificationMetadata,
      }),
    ).toBe(`Sam joined your car in “Beach” (to the event).`);
  });

  it("rides.passenger_joined_my_car when someone else added", () => {
    expect(
      base({
        kind: "rides.passenger_joined_my_car",
        metadata: {
          eventTitle: "Beach",
          passengerUserId: "other",
          passengerName: "Sam",
          leg: "FROM_EVENT",
        } as NotificationMetadata,
      }),
    ).toBe(`Alex added Sam to your car in “Beach” (from the event).`);
  });

  it("falls back for unknown kind", () => {
    expect(
      base({
        kind: "custom.unknown",
        metadata: { eventTitle: "Beach" } as NotificationMetadata,
      }),
    ).toBe(`Alex — custom.unknown in “Beach”.`);
  });
});
