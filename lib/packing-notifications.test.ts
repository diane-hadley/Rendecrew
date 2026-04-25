import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PackingItemPayload } from "./packing-list";
import { buildPackingPersistNotificationQueue } from "./packing-notifications";

const enqueueManyNotifications = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

vi.mock("@/lib/notifications", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/notifications")>();
  return { ...mod, enqueueManyNotifications };
});

function su(
  id: string,
  userId: string | null,
  quantity: number | null = 1,
): PackingItemPayload["signUps"][number] {
  return {
    id,
    quantity,
    displayName: "x",
    email: null,
    userId,
    packed: false,
  };
}

function item(
  id: string,
  name: string,
  signUps: PackingItemPayload["signUps"],
): PackingItemPayload {
  return {
    id,
    sectionId: null,
    name,
    quantity: 1,
    signUps,
  };
}

describe("buildPackingPersistNotificationQueue", () => {
  const base = {
    eventId: "e1",
    eventTitle: "Test Event",
    packingListId: "pl1",
    actorUserId: "actor1" as string | null,
  };

  it("emits removed_from_item for each sign-up when an item disappears", () => {
    const dbBefore = [
      {
        id: "i1",
        name: "Tent",
        signUps: [
          { id: "s1", quantity: 1, userId: "u1" },
          { id: "s2", quantity: 1, userId: "u2" },
        ],
      },
    ];
    const q = buildPackingPersistNotificationQueue({
      ...base,
      dbItemsBefore: dbBefore,
      itemsAfter: [],
      actorUserId: "actor1",
    });
    expect(q).toHaveLength(2);
    expect(q.every((n) => n.kind === "packing.removed_from_item")).toBe(true);
    expect(new Set(q.map((n) => n.recipientUserId))).toEqual(
      new Set(["u1", "u2"]),
    );
  });

  it("emits signup_or_quantity for new item sign-ups", () => {
    const q = buildPackingPersistNotificationQueue({
      ...base,
      dbItemsBefore: [],
      itemsAfter: [item("i1", "Cooler", [su("s1", "u1")])],
      actorUserId: null,
    });
    expect(q).toEqual([
      expect.objectContaining({
        kind: "packing.signup_or_quantity",
        recipientUserId: "u1",
        actorUserId: null,
        metadata: expect.objectContaining({
          packingItemId: "i1",
          packingSignUpId: "s1",
        }),
      }),
    ]);
  });

  it("emits signup_or_quantity when quantity changes for same user", () => {
    const dbBefore = [
      {
        id: "i1",
        name: "Plates",
        signUps: [{ id: "s1", quantity: 2, userId: "u1" }],
      },
    ];
    const q = buildPackingPersistNotificationQueue({
      ...base,
      dbItemsBefore: dbBefore,
      itemsAfter: [item("i1", "Plates", [su("s1", "u1", 3)])],
      actorUserId: "org",
    });
    expect(q).toEqual([
      expect.objectContaining({
        kind: "packing.signup_or_quantity",
        recipientUserId: "u1",
      }),
    ]);
  });

  it("emits removed for old user and signup for new user on reassignment", () => {
    const dbBefore = [
      {
        id: "i1",
        name: "Snacks",
        signUps: [{ id: "s1", quantity: 1, userId: "u1" }],
      },
    ];
    const q = buildPackingPersistNotificationQueue({
      ...base,
      dbItemsBefore: dbBefore,
      itemsAfter: [item("i1", "Snacks", [su("s1", "u2", 1)])],
      actorUserId: "org",
    });
    const kinds = q.map((n) => [n.kind, n.recipientUserId] as const);
    expect(kinds).toContainEqual(["packing.removed_from_item", "u1"]);
    expect(kinds).toContainEqual(["packing.signup_or_quantity", "u2"]);
  });

  it("dedupes duplicate queue entries for same kind/recipient/item/signUp", () => {
    const dbBefore = [
      {
        id: "i1",
        name: "X",
        signUps: [{ id: "s1", quantity: 1, userId: "u1" }],
      },
    ];
    const q = buildPackingPersistNotificationQueue({
      ...base,
      dbItemsBefore: dbBefore,
      itemsAfter: [item("i1", "X", [su("s1", "u1", 2)])],
      actorUserId: "a",
    });
    expect(q.filter((n) => n.recipientUserId === "u1")).toHaveLength(1);
  });

  it("skips sign-ups with blank userId", () => {
    const q = buildPackingPersistNotificationQueue({
      ...base,
      dbItemsBefore: [],
      itemsAfter: [item("i1", "Y", [su("s1", "  "), su("s2", null)])],
      actorUserId: "a",
    });
    expect(q).toHaveLength(0);
  });

  it("emits removed_from_item when a sign-up row is dropped from an existing item", () => {
    const dbBefore = [
      {
        id: "i1",
        name: "Forks",
        signUps: [
          { id: "s1", quantity: 1, userId: "u1" },
          { id: "s2", quantity: 1, userId: "u2" },
        ],
      },
    ];
    const q = buildPackingPersistNotificationQueue({
      ...base,
      dbItemsBefore: dbBefore,
      itemsAfter: [
        item("i1", "Forks", [su("s1", "u1", 1)]), // s2 removed
      ],
      actorUserId: "a",
    });
    expect(q).toEqual([
      expect.objectContaining({
        kind: "packing.removed_from_item",
        recipientUserId: "u2",
        metadata: expect.objectContaining({ packingSignUpId: "s2" }),
      }),
    ]);
  });

  it("emits signup_or_quantity when sign-up gains a userId from empty", () => {
    const dbBefore = [
      {
        id: "i1",
        name: "Cups",
        signUps: [{ id: "s1", quantity: 1, userId: null }],
      },
    ];
    const q = buildPackingPersistNotificationQueue({
      ...base,
      dbItemsBefore: dbBefore,
      itemsAfter: [item("i1", "Cups", [su("s1", "u5", 1)])],
      actorUserId: "a",
    });
    expect(q).toEqual([
      expect.objectContaining({
        kind: "packing.signup_or_quantity",
        recipientUserId: "u5",
      }),
    ]);
  });
});

describe("emitPackingPersistNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls enqueueManyNotifications when queue is non-empty", async () => {
    const { emitPackingPersistNotifications } =
      await import("./packing-notifications");
    await emitPackingPersistNotifications({
      eventId: "e1",
      eventTitle: "Test Event",
      packingListId: "pl1",
      dbItemsBefore: [],
      itemsAfter: [item("i1", "Z", [su("s1", "u9")])],
      actorUserId: "a",
      actorName: null,
    });
    expect(enqueueManyNotifications).toHaveBeenCalledTimes(1);
    expect(enqueueManyNotifications.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it("does not call enqueue when queue is empty", async () => {
    const { emitPackingPersistNotifications } =
      await import("./packing-notifications");
    await emitPackingPersistNotifications({
      eventId: "e1",
      eventTitle: "Test Event",
      packingListId: "pl1",
      dbItemsBefore: [],
      itemsAfter: [],
      actorUserId: "a",
      actorName: null,
    });
    expect(enqueueManyNotifications).not.toHaveBeenCalled();
  });
});
