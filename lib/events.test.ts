import { EventMemberRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canDeleteEvent,
  canManageEvent,
  formatEventRoleLabel,
  getEventForUser,
  getEventsForUser,
  normalizeEventRole,
} from "./events";

const findMany = vi.fn();
const findFirst = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    event: {
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

const baseEvent = {
  id: "e1",
  title: "Meetup",
  generalInformation: null as string | null,
  startAt: null as Date | null,
  endAt: null as Date | null,
  location: null as string | null,
  createdById: "creator-1",
  suggestionApprovalRequired: false,
  memberManagementPolicy: "ANY_MEMBER_CAN_INVITE" as const,
  packingListVisibility: "URL_PUBLIC" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("normalizeEventRole", () => {
  it("maps legacy owner to creator", () => {
    expect(normalizeEventRole("owner")).toBe(EventMemberRole.creator);
  });
});

describe("canManageEvent", () => {
  it("is true for creator and admin only", () => {
    expect(canManageEvent("owner")).toBe(true);
    expect(canManageEvent(EventMemberRole.creator)).toBe(true);
    expect(canManageEvent(EventMemberRole.admin)).toBe(true);
    expect(canManageEvent(EventMemberRole.member)).toBe(false);
    expect(canManageEvent("guest")).toBe(false);
  });
});

describe("canDeleteEvent", () => {
  it("is true only for the user matching createdById (membership role may be wrong)", () => {
    expect(canDeleteEvent("u1", { createdById: "u1" })).toBe(true);
    expect(canDeleteEvent("u2", { createdById: "u1" })).toBe(false);
  });
});

describe("formatEventRoleLabel", () => {
  it("returns friendly labels", () => {
    expect(formatEventRoleLabel(EventMemberRole.creator)).toBe("Creator");
    expect(formatEventRoleLabel("owner")).toBe("Creator");
    expect(formatEventRoleLabel(EventMemberRole.admin)).toBe("Admin");
    expect(formatEventRoleLabel(EventMemberRole.member)).toBe("Member");
  });
});

describe("getEventsForUser", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("maps membership role when present", async () => {
    findMany.mockResolvedValue([
      {
        ...baseEvent,
        eventMembers: [{ role: EventMemberRole.admin }],
      },
    ]);
    const rows = await getEventsForUser("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe(EventMemberRole.admin);
    expect(rows[0].event.id).toBe("e1");
    expect(rows[0].event).not.toHaveProperty("eventMembers");
  });

  it("uses creator when user is creator without membership row", async () => {
    findMany.mockResolvedValue([
      {
        ...baseEvent,
        createdById: "u1",
        eventMembers: [],
      },
    ]);
    const rows = await getEventsForUser("u1");
    expect(rows[0].role).toBe(EventMemberRole.creator);
  });
});

describe("getEventForUser", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("returns null when event missing", async () => {
    findFirst.mockResolvedValue(null);
    expect(await getEventForUser("e1", "u1")).toBeNull();
  });

  it("returns row with role", async () => {
    findFirst.mockResolvedValue({
      ...baseEvent,
      eventMembers: [{ role: EventMemberRole.member }],
    });
    const row = await getEventForUser("e1", "u1");
    expect(row?.role).toBe(EventMemberRole.member);
    expect(row?.event.title).toBe("Meetup");
  });
});
