import { Prisma, RideCarDirection, RidePassengerLeg } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.hoisted(() => vi.fn());

const eventRideCarFindMany = vi.hoisted(() => vi.fn());
const eventRideCarFindFirst = vi.hoisted(() => vi.fn());
const eventRideCarUpdate = vi.hoisted(() => vi.fn());
const eventRideCarCreate = vi.hoisted(() => vi.fn());
const eventRideCarDelete = vi.hoisted(() => vi.fn());
const eventMemberFindFirst = vi.hoisted(() => vi.fn());
const ridePassengersFindFirst = vi.hoisted(() => vi.fn());
const ridePassengersFindMany = vi.hoisted(() => vi.fn());
const ridePassengersCreate = vi.hoisted(() => vi.fn());
const ridePassengersDeleteMany = vi.hoisted(() => vi.fn());
const prismaTransaction = vi.hoisted(() => vi.fn());

const txRidePassengersDeleteMany = vi.hoisted(() => vi.fn());
const txEventRideCarUpdate = vi.hoisted(() => vi.fn());
const txEventRideCarDelete = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: prismaTransaction,
    eventRideCar: {
      findMany: eventRideCarFindMany,
      findFirst: eventRideCarFindFirst,
      update: eventRideCarUpdate,
      create: eventRideCarCreate,
      delete: eventRideCarDelete,
    },
    eventMember: {
      findFirst: eventMemberFindFirst,
    },
    event_ride_passengers: {
      findFirst: ridePassengersFindFirst,
      findMany: ridePassengersFindMany,
      create: ridePassengersCreate,
      deleteMany: ridePassengersDeleteMany,
    },
  },
}));

vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
}));

vi.mock("@/lib/user", () => ({
  getOrCreateUser: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  enqueueNotification: vi.fn().mockResolvedValue(undefined),
}));

import { getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";
import {
  addRidePassenger,
  deleteRideCar,
  disableRideCarLeg,
  listEventRides,
  removeRidePassenger,
  upsertRideCar,
} from "./event-rides";

function mockRidesContext() {
  vi.mocked(getOrCreateUser).mockResolvedValue({
    id: "u1",
  } as Awaited<ReturnType<typeof getOrCreateUser>>);
  vi.mocked(getEventForUser).mockResolvedValue({
    event: {
      id: "e1",
      ridesEnabled: true,
      startAtTimeZone: "America/Los_Angeles",
      endAtTimeZone: "America/Los_Angeles",
    },
    role: "member",
  } as Awaited<ReturnType<typeof getEventForUser>>);
}

function basePrismaCar(overrides: Record<string, unknown> = {}) {
  return {
    id: "car1",
    eventId: "e1",
    driver: {
      id: "mem-driver",
      user: { id: "u-driver", name: "Dan Drive", email: "dan@example.com" },
    },
    passengerCapacity: 3,
    direction: RideCarDirection.TO_EVENT,
    makeModel: "Honda",
    funName: null,
    notes: null,
    departure_location: "Seattle",
    departure_toward_event_at: new Date("2026-06-01T15:00:00.000Z"),
    expected_arrival_at_event_at: null,
    returning_to: null,
    departure_from_event_at: null,
    expected_arrival_home_at: null,
    event_ride_passengers: [] as {
      leg: RidePassengerLeg;
      event_members: { id: string; user: { id: string; name: string } };
    }[],
    ...overrides,
  };
}

describe("listEventRides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaTransaction.mockReset();
    txRidePassengersDeleteMany.mockReset();
    txEventRideCarUpdate.mockReset();
    txEventRideCarDelete.mockReset();
    mockRidesContext();
    eventRideCarFindMany.mockResolvedValue([]);
  });

  it("returns error when event is missing", async () => {
    vi.mocked(getEventForUser).mockResolvedValue(null);
    const r = await listEventRides("e1");
    expect(r).toEqual({ ok: false, error: "Event not found" });
    expect(eventRideCarFindMany).not.toHaveBeenCalled();
  });

  it("returns error when rides are disabled", async () => {
    vi.mocked(getEventForUser).mockResolvedValue({
      event: {
        id: "e1",
        ridesEnabled: false,
        startAtTimeZone: "UTC",
        endAtTimeZone: "UTC",
      },
      role: "member",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    const r = await listEventRides("e1");
    expect(r).toEqual({
      ok: false,
      error: "Rides are disabled for this event",
    });
  });

  it("maps cars and passengers", async () => {
    eventRideCarFindMany.mockResolvedValue([
      basePrismaCar({
        event_ride_passengers: [
          {
            leg: RidePassengerLeg.TO_EVENT,
            event_members: {
              id: "mem-p1",
              user: { id: "u-p1", name: "Pat Rider" },
            },
          },
          {
            leg: RidePassengerLeg.FROM_EVENT,
            event_members: {
              id: "mem-p2",
              user: { id: "u-p2", name: "Alex Back" },
            },
          },
        ],
      }),
    ]);

    const r = await listEventRides("e1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event).toEqual({
      id: "e1",
      startAtTimeZone: "America/Los_Angeles",
      endAtTimeZone: "America/Los_Angeles",
    });
    expect(r.cars).toHaveLength(1);
    const car = r.cars[0];
    expect(car.driver.membershipId).toBe("mem-driver");
    expect(car.toEvent.from).toBe("Seattle");
    expect(car.toEvent.departsAt).toBe("2026-06-01T15:00:00.000Z");
    expect(car.passengers.TO_EVENT).toEqual([
      { membershipId: "mem-p1", userId: "u-p1", name: "Pat Rider" },
    ]);
    expect(car.passengers.FROM_EVENT).toEqual([
      { membershipId: "mem-p2", userId: "u-p2", name: "Alex Back" },
    ]);
  });
});

describe("upsertRideCar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaTransaction.mockReset();
    mockRidesContext();
    eventMemberFindFirst.mockResolvedValue({
      id: "mem-driver",
      userId: "u-driver",
    });
    ridePassengersFindFirst.mockResolvedValue(null);
  });

  it("rejects invalid passenger capacity", async () => {
    const r = await upsertRideCar({
      eventId: "e1",
      driverEventMemberId: "mem-driver",
      passengerCapacity: 1.5,
      direction: RideCarDirection.TO_EVENT,
    });
    expect(r).toEqual({
      ok: false,
      error: "Passenger capacity must be an integer ≥ 0",
    });
  });

  it("rejects driver that is not an event member", async () => {
    eventMemberFindFirst.mockResolvedValue(null);
    const r = await upsertRideCar({
      eventId: "e1",
      driverEventMemberId: "ghost",
      passengerCapacity: 2,
      direction: RideCarDirection.TO_EVENT,
    });
    expect(r).toEqual({
      ok: false,
      error: "Driver must be a member of this event",
    });
  });

  it("rejects update when car is missing", async () => {
    eventRideCarFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const r = await upsertRideCar({
      eventId: "e1",
      carId: "missing",
      driverEventMemberId: "mem-driver",
      passengerCapacity: 2,
      direction: RideCarDirection.TO_EVENT,
    });
    expect(r).toEqual({ ok: false, error: "Car not found" });
  });

  it("rejects shrinking capacity below current sign-ups", async () => {
    eventRideCarFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "car1",
      event_ride_passengers: [{ leg: RidePassengerLeg.TO_EVENT }],
      driver: { userId: "u-driver" },
    });
    const r = await upsertRideCar({
      eventId: "e1",
      carId: "car1",
      driverEventMemberId: "mem-driver",
      passengerCapacity: 0,
      direction: RideCarDirection.TO_EVENT,
    });
    expect(r).toEqual({
      ok: false,
      error:
        "Passenger capacity cannot be less than current sign-ups (1) for To Event.",
    });
  });

  it("creates a car", async () => {
    eventRideCarFindFirst.mockResolvedValue(null);
    eventRideCarCreate.mockResolvedValue({ id: "new-car" });
    const r = await upsertRideCar({
      eventId: "e1",
      driverEventMemberId: "mem-driver",
      passengerCapacity: 2,
      direction: RideCarDirection.BOTH,
      toEvent: { from: "A", departsAt: "2026-01-01T12:00:00.000Z" },
    });
    expect(r).toEqual({ ok: true, carId: "new-car" });
    expect(eventRideCarCreate).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
  });

  it("updates a car", async () => {
    eventRideCarFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "car1",
      event_ride_passengers: [],
      driver: { userId: "u-driver" },
    });
    eventRideCarUpdate.mockResolvedValue({ id: "car1" });
    const r = await upsertRideCar({
      eventId: "e1",
      carId: "car1",
      driverEventMemberId: "mem-driver",
      passengerCapacity: 4,
      direction: RideCarDirection.FROM_EVENT,
    });
    expect(r).toEqual({ ok: true, carId: "car1" });
    expect(eventRideCarUpdate).toHaveBeenCalled();
  });
});

describe("deleteRideCar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRidesContext();
  });

  it("returns error when car is missing", async () => {
    eventRideCarFindFirst.mockResolvedValue(null);
    const r = await deleteRideCar("e1", "car1");
    expect(r).toEqual({ ok: false, error: "Car not found" });
  });

  it("deletes an existing car", async () => {
    eventRideCarFindFirst.mockResolvedValue({
      id: "car1",
      driver: { userId: "u-driver" },
      event_ride_passengers: [],
    });
    const r = await deleteRideCar("e1", "car1");
    expect(r).toEqual({ ok: true });
    expect(eventRideCarDelete).toHaveBeenCalledWith({ where: { id: "car1" } });
  });
});

describe("disableRideCarLeg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRidesContext();
    ridePassengersFindMany.mockResolvedValue([]);
    txRidePassengersDeleteMany.mockResolvedValue({ count: 1 });
    txEventRideCarUpdate.mockResolvedValue({});
    txEventRideCarDelete.mockResolvedValue({});
    prismaTransaction.mockImplementation(
      async (fn: (tx: Record<string, unknown>) => Promise<void>) => {
        await fn({
          event_ride_passengers: {
            deleteMany: txRidePassengersDeleteMany,
          },
          eventRideCar: {
            update: txEventRideCarUpdate,
            delete: txEventRideCarDelete,
          },
        });
      },
    );
  });

  it("returns error when car is missing", async () => {
    eventRideCarFindFirst.mockResolvedValue(null);
    const r = await disableRideCarLeg({
      eventId: "e1",
      carId: "c1",
      leg: "TO_EVENT",
    });
    expect(r).toEqual({ ok: false, error: "Car not found" });
  });

  it("returns error when direction does not match car", async () => {
    eventRideCarFindFirst.mockResolvedValue({
      id: "c1",
      direction: RideCarDirection.TO_EVENT,
    });
    const r = await disableRideCarLeg({
      eventId: "e1",
      carId: "c1",
      leg: "FROM_EVENT",
    });
    expect(r).toEqual({
      ok: false,
      error: "That car does not drive this direction",
    });
  });

  it("for BOTH, narrows to the remaining leg", async () => {
    eventRideCarFindFirst.mockResolvedValueOnce({
      id: "c1",
      direction: RideCarDirection.BOTH,
    });
    const r = await disableRideCarLeg({
      eventId: "e1",
      carId: "c1",
      leg: "TO_EVENT",
    });
    expect(r).toEqual({ ok: true });
    expect(txRidePassengersDeleteMany).toHaveBeenCalled();
    expect(txEventRideCarUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({
          direction: RideCarDirection.FROM_EVENT,
        }),
      }),
    );
    expect(txEventRideCarDelete).not.toHaveBeenCalled();
  });

  it("for single-direction car, deletes the car", async () => {
    eventRideCarFindFirst
      .mockResolvedValueOnce({
        id: "c1",
        direction: RideCarDirection.TO_EVENT,
      })
      .mockResolvedValueOnce({
        id: "c1",
        driver: { userId: "u-d" },
        event_ride_passengers: [],
      });
    const r = await disableRideCarLeg({
      eventId: "e1",
      carId: "c1",
      leg: "TO_EVENT",
    });
    expect(r).toEqual({ ok: true });
    expect(txEventRideCarDelete).toHaveBeenCalledWith({
      where: { id: "c1" },
    });
  });
});

describe("addRidePassenger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRidesContext();
    ridePassengersCreate.mockResolvedValue({});
  });

  it("returns validation error from assertPassengerAllowed", async () => {
    eventRideCarFindFirst.mockResolvedValue(null);
    const r = await addRidePassenger({
      eventId: "e1",
      carId: "c1",
      leg: "TO_EVENT",
      eventMemberId: "mem1",
    });
    expect(r).toEqual({ ok: false, error: "Car not found" });
    expect(ridePassengersCreate).not.toHaveBeenCalled();
  });

  it("maps unique violation to a friendly error", async () => {
    eventRideCarFindFirst
      .mockResolvedValueOnce({
        id: "c1",
        direction: RideCarDirection.TO_EVENT,
        passengerCapacity: 3,
        driverEventMemberId: "driver",
        event_ride_passengers: [],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "c1",
        driver: { userId: "u-dom" },
      });
    eventMemberFindFirst
      .mockResolvedValueOnce({ id: "mem1", userId: "u-p" })
      .mockResolvedValueOnce({
        id: "mem1",
        user: { id: "u-p", name: "Pat" },
      });
    ridePassengersCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const r = await addRidePassenger({
      eventId: "e1",
      carId: "c1",
      leg: "TO_EVENT",
      eventMemberId: "mem1",
    });
    expect(r).toEqual({
      ok: false,
      error: "That member is already in another car for To Event.",
    });
  });

  it("adds a passenger", async () => {
    eventRideCarFindFirst
      .mockResolvedValueOnce({
        id: "c1",
        direction: RideCarDirection.TO_EVENT,
        passengerCapacity: 3,
        driverEventMemberId: "driver",
        event_ride_passengers: [{ id: "x" }],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "c1",
        driver: { userId: "u-dom" },
      });
    eventMemberFindFirst
      .mockResolvedValueOnce({
        id: "mem1",
        userId: "u-pass",
      })
      .mockResolvedValueOnce({
        id: "mem1",
        user: { id: "u-pass", name: "Pat" },
      });

    const r = await addRidePassenger({
      eventId: "e1",
      carId: "c1",
      leg: "TO_EVENT",
      eventMemberId: "mem1",
    });
    expect(r).toEqual({ ok: true });
    expect(ridePassengersCreate).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/events/e1");
  });
});

describe("removeRidePassenger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRidesContext();
    ridePassengersDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("removes passenger rows", async () => {
    eventMemberFindFirst.mockResolvedValue({
      id: "mem1",
      userId: "u-pass-off",
    });
    const r = await removeRidePassenger({
      eventId: "e1",
      carId: "c1",
      leg: "FROM_EVENT",
      eventMemberId: "mem1",
    });
    expect(r).toEqual({ ok: true });
    expect(ridePassengersDeleteMany).toHaveBeenCalledWith({
      where: {
        car_id: "c1",
        event_member_id: "mem1",
        leg: RidePassengerLeg.FROM_EVENT,
      },
    });
  });
});
