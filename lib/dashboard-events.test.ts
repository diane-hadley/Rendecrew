import { EventMemberRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { partitionDashboardEvents } from "./dashboard-events";
import type { DashboardEventRow } from "./events";

const fixedNow = new Date("2026-04-30T12:00:00Z");

function row(
  overrides: Partial<DashboardEventRow["event"]> & {
    id: string;
    title: string;
  },
  role: EventMemberRole = EventMemberRole.member,
): DashboardEventRow {
  const createdAt = overrides.createdAt ?? new Date("2026-01-01T00:00:00Z");
  return {
    event: {
      id: overrides.id,
      title: overrides.title,
      generalInformation: overrides.generalInformation ?? null,
      startAt: overrides.startAt ?? null,
      startAtTimeZone: overrides.startAtTimeZone ?? "UTC",
      endAt: overrides.endAt ?? null,
      endAtTimeZone: overrides.endAtTimeZone ?? "UTC",
      location: overrides.location ?? null,
      createdById: overrides.createdById ?? "u1",
      suggestionApprovalRequired: false,
      memberManagementPolicy: "ANY_MEMBER_CAN_INVITE",
      packingListVisibility: "URL_PUBLIC",
      packingEnabled: false,
      ridesEnabled: false,
      taskBoardEnabled: false,
      rides_mode: "RIDES_UNIFIED",
      rides_hidden_built_in_field_keys: [],
      createdAt,
      updatedAt: overrides.updatedAt ?? createdAt,
    },
    role,
  };
}

describe("partitionDashboardEvents", () => {
  it("puts rows missing start or end in noDate, newest created first", () => {
    const a = row({
      id: "a",
      title: "Old draft",
      startAt: null,
      endAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const b = row({
      id: "b",
      title: "New draft",
      startAt: null,
      endAt: null,
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });
    const { noDate, upcoming, past } = partitionDashboardEvents(
      [a, b],
      fixedNow,
    );
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(0);
    expect(noDate.map((r) => r.event.id)).toEqual(["b", "a"]);
  });

  it("classifies past by end before today in endAtTimeZone", () => {
    const ended = row({
      id: "past",
      title: "Done",
      startAt: new Date("2026-04-01T10:00:00Z"),
      endAt: new Date("2026-04-29T23:00:00Z"),
      endAtTimeZone: "America/Los_Angeles",
    });
    const { past, upcoming } = partitionDashboardEvents([ended], fixedNow);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
    expect(past[0].event.id).toBe("past");
  });

  it("sorts upcoming by start ascending and past by end descending", () => {
    const later = row({
      id: "later",
      title: "Later",
      startAt: new Date("2026-05-10T12:00:00Z"),
      endAt: new Date("2026-05-11T12:00:00Z"),
    });
    const sooner = row({
      id: "sooner",
      title: "Sooner",
      startAt: new Date("2026-05-02T12:00:00Z"),
      endAt: new Date("2026-05-03T12:00:00Z"),
    });
    const oldPast = row({
      id: "oldPast",
      title: "Old past",
      startAt: new Date("2026-01-01T12:00:00Z"),
      endAt: new Date("2026-01-02T12:00:00Z"),
    });
    const recentPast = row({
      id: "recentPast",
      title: "Recent past",
      startAt: new Date("2026-04-20T12:00:00Z"),
      endAt: new Date("2026-04-21T12:00:00Z"),
    });
    const { upcoming, past } = partitionDashboardEvents(
      [later, sooner, oldPast, recentPast],
      fixedNow,
    );
    expect(upcoming.map((r) => r.event.id)).toEqual(["sooner", "later"]);
    expect(past.map((r) => r.event.id)).toEqual(["recentPast", "oldPast"]);
  });
});
