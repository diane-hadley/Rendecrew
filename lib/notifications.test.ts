import { beforeEach, describe, expect, it, vi } from "vitest";

const eventMemberFindUnique = vi.hoisted(() => vi.fn());
const userNotificationPreferencesFindUnique = vi.hoisted(() => vi.fn());
const eventMemberNotificationPreferencesFindUnique = vi.hoisted(() => vi.fn());
const notificationCreate = vi.hoisted(() => vi.fn());
const notificationFindMany = vi.hoisted(() => vi.fn());
const notificationUpdateMany = vi.hoisted(() => vi.fn());
const notificationCount = vi.hoisted(() => vi.fn());
const notificationDeleteMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventMember: { findUnique: eventMemberFindUnique },
    userNotificationPreferences: {
      findUnique: userNotificationPreferencesFindUnique,
    },
    eventMemberNotificationPreferences: {
      findUnique: eventMemberNotificationPreferencesFindUnique,
    },
    notification: {
      create: notificationCreate,
      findMany: notificationFindMany,
      updateMany: notificationUpdateMany,
      count: notificationCount,
      deleteMany: notificationDeleteMany,
    },
  },
}));

import {
  countUnreadNotifications,
  enqueueManyNotifications,
  enqueueNotification,
  insertNotificationIgnoringPreferences,
  isNotificationEnabledForUserEvent,
  listNotificationsForUser,
  markAllNotificationsReadForUser,
  purgeNotificationsOlderThanRetention,
} from "./notifications";

describe("isNotificationEnabledForUserEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when user is not an event member", async () => {
    eventMemberFindUnique.mockResolvedValue(null);
    await expect(
      isNotificationEnabledForUserEvent({
        recipientUserId: "u1",
        eventId: "e1",
        kind: "event.member_added",
      }),
    ).resolves.toBe(false);
    expect(userNotificationPreferencesFindUnique).not.toHaveBeenCalled();
  });

  it("returns true when global default applies and kind is not disabled", async () => {
    eventMemberFindUnique.mockResolvedValue({ id: "em1" });
    userNotificationPreferencesFindUnique.mockResolvedValue(null);
    eventMemberNotificationPreferencesFindUnique.mockResolvedValue(null);

    await expect(
      isNotificationEnabledForUserEvent({
        recipientUserId: "u1",
        eventId: "e1",
        kind: "tasks.assignment_changed",
      }),
    ).resolves.toBe(true);
  });

  it("returns false when kind is in user disabledKinds and no override", async () => {
    eventMemberFindUnique.mockResolvedValue({ id: "em1" });
    userNotificationPreferencesFindUnique.mockResolvedValue({
      disabledKinds: ["tasks.assignment_changed"],
    });
    eventMemberNotificationPreferencesFindUnique.mockResolvedValue({
      perKindOverrides: {},
    });

    await expect(
      isNotificationEnabledForUserEvent({
        recipientUserId: "u1",
        eventId: "e1",
        kind: "tasks.assignment_changed",
      }),
    ).resolves.toBe(false);
  });

  it("returns true when per-event override enables a globally-disabled kind", async () => {
    eventMemberFindUnique.mockResolvedValue({ id: "em1" });
    userNotificationPreferencesFindUnique.mockResolvedValue({
      disabledKinds: ["tasks.assignment_changed"],
    });
    eventMemberNotificationPreferencesFindUnique.mockResolvedValue({
      perKindOverrides: { "tasks.assignment_changed": true },
    });

    await expect(
      isNotificationEnabledForUserEvent({
        recipientUserId: "u1",
        eventId: "e1",
        kind: "tasks.assignment_changed",
      }),
    ).resolves.toBe(true);
  });

  it("ignores per-event override for event membership kinds (account default only)", async () => {
    eventMemberFindUnique.mockResolvedValue({ id: "em1" });
    userNotificationPreferencesFindUnique.mockResolvedValue({
      disabledKinds: [],
    });
    eventMemberNotificationPreferencesFindUnique.mockResolvedValue({
      perKindOverrides: { "event.member_added": false },
    });

    await expect(
      isNotificationEnabledForUserEvent({
        recipientUserId: "u1",
        eventId: "e1",
        kind: "event.member_added",
      }),
    ).resolves.toBe(true);
  });

  it("ignores invalid keys in perKindOverrides JSON", async () => {
    eventMemberFindUnique.mockResolvedValue({ id: "em1" });
    userNotificationPreferencesFindUnique.mockResolvedValue({
      disabledKinds: [],
    });
    eventMemberNotificationPreferencesFindUnique.mockResolvedValue({
      perKindOverrides: { bogus: true, "event.member_added": "no" },
    });

    await expect(
      isNotificationEnabledForUserEvent({
        recipientUserId: "u1",
        eventId: "e1",
        kind: "event.member_added",
      }),
    ).resolves.toBe(true);
  });
});

describe("enqueueNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when actor is the recipient", async () => {
    await enqueueNotification({
      recipientUserId: "u1",
      actorUserId: "u1",
      kind: "event.member_added",
      eventId: "e1",
    });
    expect(eventMemberFindUnique).not.toHaveBeenCalled();
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("no-ops when preferences disable the kind", async () => {
    eventMemberFindUnique.mockResolvedValue(null);
    await enqueueNotification({
      recipientUserId: "u1",
      actorUserId: "u2",
      kind: "event.member_added",
      eventId: "e1",
    });
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("creates notification when enabled", async () => {
    eventMemberFindUnique.mockResolvedValue({ id: "em1" });
    userNotificationPreferencesFindUnique.mockResolvedValue(null);
    eventMemberNotificationPreferencesFindUnique.mockResolvedValue(null);
    notificationCreate.mockResolvedValue({});

    await enqueueNotification({
      recipientUserId: "u1",
      actorUserId: "u2",
      kind: "event.member_added",
      eventId: "e1",
      metadata: { eventTitle: "Hi" },
      dedupeKey: "  k  ",
    });

    expect(notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: "u1",
        actorUserId: "u2",
        kind: "event.member_added",
        dedupeKey: "k",
      }),
    });
  });

  it("swallows unique violation on dedupeKey (P2002)", async () => {
    eventMemberFindUnique.mockResolvedValue({ id: "em1" });
    userNotificationPreferencesFindUnique.mockResolvedValue(null);
    eventMemberNotificationPreferencesFindUnique.mockResolvedValue(null);
    notificationCreate.mockRejectedValue({ code: "P2002" });

    await expect(
      enqueueNotification({
        recipientUserId: "u1",
        actorUserId: "u2",
        kind: "event.member_added",
        eventId: "e1",
        dedupeKey: "dup",
      }),
    ).resolves.toBeUndefined();
  });

  it("rethrows non-unique errors from create", async () => {
    eventMemberFindUnique.mockResolvedValue({ id: "em1" });
    userNotificationPreferencesFindUnique.mockResolvedValue(null);
    eventMemberNotificationPreferencesFindUnique.mockResolvedValue(null);
    notificationCreate.mockRejectedValue(new Error("db down"));

    await expect(
      enqueueNotification({
        recipientUserId: "u1",
        actorUserId: "u2",
        kind: "event.member_added",
        eventId: "e1",
      }),
    ).rejects.toThrow("db down");
  });
});

describe("enqueueManyNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes items sequentially", async () => {
    eventMemberFindUnique.mockResolvedValue({ id: "em1" });
    userNotificationPreferencesFindUnique.mockResolvedValue(null);
    eventMemberNotificationPreferencesFindUnique.mockResolvedValue(null);
    notificationCreate.mockResolvedValue({});

    await enqueueManyNotifications([
      {
        recipientUserId: "u1",
        actorUserId: "u2",
        kind: "event.member_added",
        eventId: "e1",
      },
      {
        recipientUserId: "u3",
        actorUserId: "u2",
        kind: "event.member_added",
        eventId: "e1",
      },
    ]);

    expect(notificationCreate).toHaveBeenCalledTimes(2);
  });
});

describe("insertNotificationIgnoringPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when actor equals recipient", async () => {
    await insertNotificationIgnoringPreferences({
      recipientUserId: "u1",
      actorUserId: "u1",
      kind: "event.member_removed",
    });
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("creates without membership check", async () => {
    notificationCreate.mockResolvedValue({});
    await insertNotificationIgnoringPreferences({
      recipientUserId: "u1",
      actorUserId: "u2",
      kind: "event.member_removed",
      metadata: { eventId: "e1" },
    });
    expect(eventMemberFindUnique).not.toHaveBeenCalled();
    expect(notificationCreate).toHaveBeenCalled();
  });

  it("swallows P2002", async () => {
    notificationCreate.mockRejectedValue({ code: "P2002" });
    await expect(
      insertNotificationIgnoringPreferences({
        recipientUserId: "u1",
        actorUserId: null,
        kind: "event.member_removed",
      }),
    ).resolves.toBeUndefined();
  });

  it("rethrows non-unique errors from create", async () => {
    notificationCreate.mockRejectedValue(new Error("db"));
    await expect(
      insertNotificationIgnoringPreferences({
        recipientUserId: "u1",
        actorUserId: "u2",
        kind: "event.member_removed",
      }),
    ).rejects.toThrow("db");
  });
});

describe("markAllNotificationsReadForUser", () => {
  it("returns update count", async () => {
    notificationUpdateMany.mockResolvedValue({ count: 3 });
    await expect(markAllNotificationsReadForUser("u1")).resolves.toEqual({
      count: 3,
    });
  });
});

describe("countUnreadNotifications", () => {
  it("delegates to prisma.count", async () => {
    notificationCount.mockResolvedValue(12);
    await expect(countUnreadNotifications("u1")).resolves.toBe(12);
  });
});

describe("listNotificationsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clamps take to [1, 50] (findMany uses page size + 1)", async () => {
    notificationFindMany.mockResolvedValue([]);
    await listNotificationsForUser({ userId: "u1", take: 0 });
    expect(notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );

    vi.clearAllMocks();
    notificationFindMany.mockResolvedValue([]);
    await listNotificationsForUser({ userId: "u1", take: 999 });
    expect(notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 51 }),
    );
  });

  it("returns items and null nextCursor when no extra row", async () => {
    const t = new Date("2026-01-15T12:00:00.000Z");
    notificationFindMany.mockResolvedValue([
      {
        id: "n1",
        kind: "event.member_added",
        createdAt: t,
        readAt: null,
        metadata: {},
        actorUserId: "a1",
      },
    ]);

    const r = await listNotificationsForUser({ userId: "u1", take: 5 });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].readAt).toBeNull();
    expect(r.nextCursor).toBeNull();
  });

  it("returns nextCursor when more than one page", async () => {
    const t = new Date("2026-01-15T12:00:00.000Z");
    notificationFindMany.mockResolvedValue([
      {
        id: "n1",
        kind: "a",
        createdAt: t,
        readAt: null,
        metadata: null,
        actorUserId: null,
      },
      {
        id: "n2",
        kind: "b",
        createdAt: t,
        readAt: t,
        metadata: {},
        actorUserId: null,
      },
    ]);

    const r = await listNotificationsForUser({ userId: "u1", take: 1 });
    expect(r.items).toHaveLength(1);
    expect(r.nextCursor).toEqual({
      createdAt: t.toISOString(),
      id: "n1",
    });
  });

  it("applies cursor filter for second page", async () => {
    notificationFindMany.mockResolvedValue([]);
    const cur = {
      createdAt: "2026-01-10T00:00:00.000Z",
      id: "n99",
    };
    await listNotificationsForUser({
      userId: "u1",
      take: 10,
      cursor: cur,
    });
    expect(notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recipientUserId: "u1",
          OR: expect.any(Array),
        }),
      }),
    );
  });
});

describe("purgeNotificationsOlderThanRetention", () => {
  it("returns deleted count", async () => {
    notificationDeleteMany.mockResolvedValue({ count: 42 });
    await expect(purgeNotificationsOlderThanRetention()).resolves.toEqual({
      deleted: 42,
    });
    expect(notificationDeleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });
  });
});
