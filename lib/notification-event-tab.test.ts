import { describe, expect, it } from "vitest";
import { eventDetailTabForNotificationKind } from "./notification-event-tab";

describe("eventDetailTabForNotificationKind", () => {
  it("maps kinds to the event page tab", () => {
    expect(eventDetailTabForNotificationKind("tasks.assignment_changed")).toBe(
      "tasks",
    );
    expect(
      eventDetailTabForNotificationKind("packing.signup_or_quantity"),
    ).toBe("packing");
    expect(
      eventDetailTabForNotificationKind("rides.driver_assignment_changed"),
    ).toBe("rides");
    expect(eventDetailTabForNotificationKind("event.member_added")).toBe(
      "members",
    );
    expect(eventDetailTabForNotificationKind("tasks.due_date_changed")).toBe(
      "tasks",
    );
  });

  it("returns null for unknown kinds", () => {
    expect(eventDetailTabForNotificationKind("other")).toBeNull();
  });
});
