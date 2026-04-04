import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canManageEvent,
  getEventForUser,
  getEventsForUser,
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
  description: null as string | null,
  startAt: null as Date | null,
  endAt: null as Date | null,
  location: null as string | null,
  createdById: "creator-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("canManageEvent", () => {
  it("is true for owner and admin only", () => {
    expect(canManageEvent("owner")).toBe(true);
    expect(canManageEvent("admin")).toBe(true);
    expect(canManageEvent("member")).toBe(false);
    expect(canManageEvent("guest")).toBe(false);
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
        eventMembers: [{ role: "admin" }],
      },
    ]);
    const rows = await getEventsForUser("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
    expect(rows[0].event.id).toBe("e1");
    expect(rows[0].event).not.toHaveProperty("eventMembers");
  });

  it("uses owner when user is creator without membership row", async () => {
    findMany.mockResolvedValue([
      {
        ...baseEvent,
        createdById: "u1",
        eventMembers: [],
      },
    ]);
    const rows = await getEventsForUser("u1");
    expect(rows[0].role).toBe("owner");
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
      eventMembers: [{ role: "member" }],
    });
    const row = await getEventForUser("e1", "u1");
    expect(row?.role).toBe("member");
    expect(row?.event.title).toBe("Meetup");
  });
});
