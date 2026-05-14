"use server";

import { Prisma, RideCarDirection, RidePassengerLeg } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getEventForUser } from "@/lib/events";
import { enqueueNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";
import type {
  ListEventRidesResult,
  MutateRidePassengerResult,
  RideCarRow,
  RideMemberListItem,
  RidePassenger,
} from "@/lib/event-rides-types";

function carCoversLeg(
  direction: RideCarDirection,
  leg: RidePassengerLeg,
): boolean {
  if (leg === RidePassengerLeg.UNIFIED) return false;
  if (direction === RideCarDirection.BOTH) return true;
  if (direction === RideCarDirection.TO_EVENT)
    return leg === RidePassengerLeg.TO_EVENT;
  return leg === RidePassengerLeg.FROM_EVENT;
}

function directionCoversLeg(
  direction: RideCarDirection,
  leg: RidePassengerLeg,
): boolean {
  return carCoversLeg(direction, leg);
}

async function requireEventMember(eventId: string) {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false as const, error: "Event not found" };
  return { ok: true as const, user, row };
}

async function requireRidesEnabled(eventId: string) {
  const r = await requireEventMember(eventId);
  if (!r.ok) return r;
  if (!r.row.event.ridesEnabled) {
    return { ok: false as const, error: "Rides are disabled for this event" };
  }
  return r;
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export async function listEventRides(
  eventId: string,
): Promise<ListEventRidesResult> {
  const r = await requireRidesEnabled(eventId);
  if (!r.ok) return r;

  const cars = await prisma.eventRideCar.findMany({
    where: { eventId },
    orderBy: [{ sort_order: "asc" }, { createdAt: "asc" }],
    include: {
      driver: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      event_ride_passengers: {
        include: {
          event_members: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });

  return {
    ok: true,
    event: {
      id: eventId,
      startAtTimeZone: r.row.event.startAtTimeZone,
      endAtTimeZone: r.row.event.endAtTimeZone,
    },
    cars: cars.map((c) => {
      const passengersTo: RidePassenger[] = [];
      const passengersFrom: RidePassenger[] = [];
      for (const p of c.event_ride_passengers) {
        if (p.leg === RidePassengerLeg.TO_EVENT) {
          passengersTo.push({
            membershipId: p.event_members.id,
            userId: p.event_members.user.id,
            name: p.event_members.user.name,
          });
        } else if (p.leg === RidePassengerLeg.FROM_EVENT) {
          passengersFrom.push({
            membershipId: p.event_members.id,
            userId: p.event_members.user.id,
            name: p.event_members.user.name,
          });
        }
      }

      return {
        id: c.id,
        eventId: c.eventId,
        driver: {
          membershipId: c.driver.id,
          userId: c.driver.user.id,
          name: c.driver.user.name,
          email: c.driver.user.email,
        },
        passengerCapacity: c.passengerCapacity,
        direction: c.direction,
        makeModel: c.makeModel,
        funName: c.funName,
        notes: c.notes,
        toEvent: {
          from: c.departure_location,
          departsAt: toIso(c.departure_toward_event_at),
          departsAtTimeZone: c.departure_toward_event_time_zone,
          arrivesAt: toIso(c.expected_arrival_at_event_at),
          arrivesAtTimeZone: c.expected_arrival_at_event_time_zone,
        },
        fromEvent: {
          to: c.returning_to,
          departsAt: toIso(c.departure_from_event_at),
          departsAtTimeZone: c.departure_from_event_time_zone,
          arrivesAt: toIso(c.expected_arrival_home_at),
          arrivesAtTimeZone: c.expected_arrival_home_time_zone,
        },
        passengers: {
          TO_EVENT: passengersTo,
          FROM_EVENT: passengersFrom,
        },
      } satisfies RideCarRow;
    }),
  };
}

export type UpsertRideCarInput = {
  eventId: string;
  carId?: string;
  driverEventMemberId: string;
  passengerCapacity: number;
  direction: RideCarDirection;
  makeModel?: string | null;
  funName?: string | null;
  notes?: string | null;
  toEvent?: {
    from?: string | null;
    departsAt?: Date | string | null;
    departsAtTimeZone?: string | null;
    arrivesAt?: Date | string | null;
    arrivesAtTimeZone?: string | null;
  };
  fromEvent?: {
    to?: string | null;
    departsAt?: Date | string | null;
    departsAtTimeZone?: string | null;
    arrivesAt?: Date | string | null;
    arrivesAtTimeZone?: string | null;
  };
};

export type UpsertRideCarResult =
  | { ok: true; carId: string }
  | { ok: false; error: string };

function normalizeCapacity(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) return null;
  return v;
}

function normalizeText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

async function assertDriverAllowedForDirection(params: {
  eventId: string;
  carId?: string;
  driverEventMemberId: string;
  direction: RideCarDirection;
}): Promise<string | null> {
  const legs: RidePassengerLeg[] =
    params.direction === RideCarDirection.BOTH
      ? [RidePassengerLeg.TO_EVENT, RidePassengerLeg.FROM_EVENT]
      : params.direction === RideCarDirection.TO_EVENT
        ? [RidePassengerLeg.TO_EVENT]
        : [RidePassengerLeg.FROM_EVENT];

  for (const leg of legs) {
    const otherDriving = await prisma.eventRideCar.findFirst({
      where: {
        eventId: params.eventId,
        id: params.carId ? { not: params.carId } : undefined,
        driverEventMemberId: params.driverEventMemberId,
        OR: [
          { direction: RideCarDirection.BOTH },
          {
            direction:
              leg === RidePassengerLeg.TO_EVENT
                ? RideCarDirection.TO_EVENT
                : RideCarDirection.FROM_EVENT,
          },
        ],
      },
      select: { id: true },
    });
    if (otherDriving) {
      return `That member is already driving another car for ${leg === RidePassengerLeg.TO_EVENT ? "To Event" : "From Event"}.`;
    }

    const alreadyPassenger = await prisma.event_ride_passengers.findFirst({
      where: { event_member_id: params.driverEventMemberId, leg },
      select: { id: true },
    });
    if (alreadyPassenger) {
      return `That member is already in another car for ${leg === RidePassengerLeg.TO_EVENT ? "To Event" : "From Event"}.`;
    }
  }

  return null;
}

export async function upsertRideCar(
  input: UpsertRideCarInput,
): Promise<UpsertRideCarResult> {
  const r = await requireRidesEnabled(input.eventId);
  if (!r.ok) return r;
  const eventTitle = r.row.event.title;
  const fallbackTz = r.row.event.startAtTimeZone;

  const cap = normalizeCapacity(input.passengerCapacity);
  if (cap == null)
    return { ok: false, error: "Passenger capacity must be an integer ≥ 0" };

  if (input.direction === RideCarDirection.BOTH) {
    // ok
  } else if (
    input.direction !== RideCarDirection.TO_EVENT &&
    input.direction !== RideCarDirection.FROM_EVENT
  ) {
    return { ok: false, error: "Choose at least one direction for the car" };
  }

  const driverMember = await prisma.eventMember.findFirst({
    where: { id: input.driverEventMemberId, eventId: input.eventId },
    select: { id: true, userId: true },
  });
  if (!driverMember)
    return { ok: false, error: "Driver must be a member of this event" };

  const driverErr = await assertDriverAllowedForDirection({
    eventId: input.eventId,
    carId: input.carId,
    driverEventMemberId: input.driverEventMemberId,
    direction: input.direction,
  });
  if (driverErr) return { ok: false, error: driverErr };

  if (input.carId) {
    const existing = await prisma.eventRideCar.findFirst({
      where: { id: input.carId, eventId: input.eventId },
      include: {
        event_ride_passengers: true,
        driver: { select: { userId: true } },
      },
    });
    if (!existing) return { ok: false, error: "Car not found" };

    const legsToCheck: RidePassengerLeg[] =
      input.direction === RideCarDirection.BOTH
        ? [RidePassengerLeg.TO_EVENT, RidePassengerLeg.FROM_EVENT]
        : input.direction === RideCarDirection.TO_EVENT
          ? [RidePassengerLeg.TO_EVENT]
          : [RidePassengerLeg.FROM_EVENT];

    for (const leg of legsToCheck) {
      const count = existing.event_ride_passengers.filter(
        (p) => p.leg === leg,
      ).length;
      if (count > cap) {
        return {
          ok: false,
          error: `Passenger capacity cannot be less than current sign-ups (${count}) for ${leg === RidePassengerLeg.TO_EVENT ? "To Event" : "From Event"}.`,
        };
      }
    }

    const prevDriverUserId = existing.driver.userId;
    const nextDriverUserId = driverMember.userId;

    const updated = await prisma.eventRideCar.update({
      where: { id: input.carId },
      data: {
        driverEventMemberId: input.driverEventMemberId,
        passengerCapacity: cap,
        direction: input.direction,
        makeModel: normalizeText(input.makeModel),
        funName: normalizeText(input.funName),
        notes: normalizeText(input.notes),
        departure_location: normalizeText(input.toEvent?.from),
        departure_toward_event_at: input.toEvent?.departsAt
          ? new Date(input.toEvent.departsAt)
          : null,
        departure_toward_event_time_zone: input.toEvent?.departsAt
          ? (input.toEvent?.departsAtTimeZone ?? fallbackTz)
          : null,
        expected_arrival_at_event_at: input.toEvent?.arrivesAt
          ? new Date(input.toEvent.arrivesAt)
          : null,
        expected_arrival_at_event_time_zone: input.toEvent?.arrivesAt
          ? (input.toEvent?.arrivesAtTimeZone ?? fallbackTz)
          : null,
        returning_to: normalizeText(input.fromEvent?.to),
        departure_from_event_at: input.fromEvent?.departsAt
          ? new Date(input.fromEvent.departsAt)
          : null,
        departure_from_event_time_zone: input.fromEvent?.departsAt
          ? (input.fromEvent?.departsAtTimeZone ?? fallbackTz)
          : null,
        expected_arrival_home_at: input.fromEvent?.arrivesAt
          ? new Date(input.fromEvent.arrivesAt)
          : null,
        expected_arrival_home_time_zone: input.fromEvent?.arrivesAt
          ? (input.fromEvent?.arrivesAtTimeZone ?? fallbackTz)
          : null,
      },
      select: { id: true },
    });

    if (prevDriverUserId !== nextDriverUserId) {
      await enqueueNotification({
        recipientUserId: prevDriverUserId,
        actorUserId: r.user.id,
        kind: "rides.driver_assignment_changed",
        eventId: input.eventId,
        metadata: {
          eventId: input.eventId,
          eventTitle,
          rideCarId: updated.id,
          change: "removed",
        },
      });
      await enqueueNotification({
        recipientUserId: nextDriverUserId,
        actorUserId: r.user.id,
        kind: "rides.driver_assignment_changed",
        eventId: input.eventId,
        metadata: {
          eventId: input.eventId,
          eventTitle,
          rideCarId: updated.id,
          change: "assigned",
        },
      });
    }

    revalidatePath(`/dashboard/events/${input.eventId}`);
    return { ok: true, carId: updated.id };
  }

  const created = await prisma.eventRideCar.create({
    data: {
      eventId: input.eventId,
      driverEventMemberId: input.driverEventMemberId,
      passengerCapacity: cap,
      direction: input.direction,
      makeModel: normalizeText(input.makeModel),
      funName: normalizeText(input.funName),
      notes: normalizeText(input.notes),
      departure_location: normalizeText(input.toEvent?.from),
      departure_toward_event_at: input.toEvent?.departsAt
        ? new Date(input.toEvent.departsAt)
        : null,
      departure_toward_event_time_zone: input.toEvent?.departsAt
        ? (input.toEvent?.departsAtTimeZone ?? fallbackTz)
        : null,
      expected_arrival_at_event_at: input.toEvent?.arrivesAt
        ? new Date(input.toEvent.arrivesAt)
        : null,
      expected_arrival_at_event_time_zone: input.toEvent?.arrivesAt
        ? (input.toEvent?.arrivesAtTimeZone ?? fallbackTz)
        : null,
      returning_to: normalizeText(input.fromEvent?.to),
      departure_from_event_at: input.fromEvent?.departsAt
        ? new Date(input.fromEvent.departsAt)
        : null,
      departure_from_event_time_zone: input.fromEvent?.departsAt
        ? (input.fromEvent?.departsAtTimeZone ?? fallbackTz)
        : null,
      expected_arrival_home_at: input.fromEvent?.arrivesAt
        ? new Date(input.fromEvent.arrivesAt)
        : null,
      expected_arrival_home_time_zone: input.fromEvent?.arrivesAt
        ? (input.fromEvent?.arrivesAtTimeZone ?? fallbackTz)
        : null,
    },
    select: { id: true },
  });

  await enqueueNotification({
    recipientUserId: driverMember.userId,
    actorUserId: r.user.id,
    kind: "rides.driver_assignment_changed",
    eventId: input.eventId,
    metadata: {
      eventId: input.eventId,
      eventTitle,
      rideCarId: created.id,
      change: "assigned",
    },
  });

  revalidatePath(`/dashboard/events/${input.eventId}`);
  return { ok: true, carId: created.id };
}

export type DeleteRideCarResult = { ok: true } | { ok: false; error: string };

export async function deleteRideCar(
  eventId: string,
  carId: string,
): Promise<DeleteRideCarResult> {
  const r = await requireRidesEnabled(eventId);
  if (!r.ok) return r;
  const eventTitle = r.row.event.title;

  const car = await prisma.eventRideCar.findFirst({
    where: { id: carId, eventId },
    include: {
      driver: { select: { userId: true } },
      event_ride_passengers: {
        include: {
          event_members: { select: { userId: true } },
        },
      },
    },
  });
  if (!car) return { ok: false, error: "Car not found" };

  await prisma.eventRideCar.delete({ where: { id: carId } });

  await enqueueNotification({
    recipientUserId: car.driver.userId,
    actorUserId: r.user.id,
    kind: "rides.driver_assignment_changed",
    eventId,
    metadata: { eventId, eventTitle, rideCarId: carId, change: "removed" },
  });
  for (const p of car.event_ride_passengers) {
    await enqueueNotification({
      recipientUserId: p.event_members.userId,
      actorUserId: r.user.id,
      kind: "rides.car_assignment_changed",
      eventId,
      metadata: { eventId, eventTitle, rideCarId: carId, change: "removed" },
    });
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

export async function disableRideCarLeg(params: {
  eventId: string;
  carId: string;
  leg: "TO_EVENT" | "FROM_EVENT";
}): Promise<DeleteRideCarResult> {
  const r = await requireRidesEnabled(params.eventId);
  if (!r.ok) return r;
  const eventTitle = r.row.event.title;

  const leg =
    params.leg === "TO_EVENT"
      ? RidePassengerLeg.TO_EVENT
      : RidePassengerLeg.FROM_EVENT;

  const car = await prisma.eventRideCar.findFirst({
    where: { id: params.carId, eventId: params.eventId },
    select: { id: true, direction: true },
  });
  if (!car) return { ok: false, error: "Car not found" };
  if (!directionCoversLeg(car.direction, leg))
    return { ok: false, error: "That car does not drive this direction" };

  const passengersThisLeg = await prisma.event_ride_passengers.findMany({
    where: { car_id: params.carId, leg },
    include: { event_members: { select: { userId: true } } },
  });

  const willDeleteCar = car.direction !== RideCarDirection.BOTH;
  const carBeforeDelete = willDeleteCar
    ? await prisma.eventRideCar.findFirst({
        where: { id: params.carId, eventId: params.eventId },
        include: {
          driver: { select: { userId: true } },
          event_ride_passengers: {
            include: { event_members: { select: { userId: true } } },
          },
        },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.event_ride_passengers.deleteMany({
      where: { car_id: params.carId, leg },
    });

    if (car.direction === RideCarDirection.BOTH) {
      const nextDirection =
        leg === RidePassengerLeg.TO_EVENT
          ? RideCarDirection.FROM_EVENT
          : RideCarDirection.TO_EVENT;
      await tx.eventRideCar.update({
        where: { id: params.carId },
        data:
          leg === RidePassengerLeg.TO_EVENT
            ? {
                direction: nextDirection,
                departure_location: null,
                departure_toward_event_at: null,
                expected_arrival_at_event_at: null,
                departure_toward_event_time_zone: null,
                expected_arrival_at_event_time_zone: null,
              }
            : {
                direction: nextDirection,
                returning_to: null,
                departure_from_event_at: null,
                expected_arrival_home_at: null,
                departure_from_event_time_zone: null,
                expected_arrival_home_time_zone: null,
              },
      });
      return;
    }

    // Only one direction existed; deleting that direction deletes the car.
    await tx.eventRideCar.delete({ where: { id: params.carId } });
  });

  if (willDeleteCar && carBeforeDelete) {
    await enqueueNotification({
      recipientUserId: carBeforeDelete.driver.userId,
      actorUserId: r.user.id,
      kind: "rides.driver_assignment_changed",
      eventId: params.eventId,
      metadata: {
        eventId: params.eventId,
        eventTitle,
        rideCarId: params.carId,
        change: "removed",
      },
    });
    for (const p of carBeforeDelete.event_ride_passengers) {
      await enqueueNotification({
        recipientUserId: p.event_members.userId,
        actorUserId: r.user.id,
        kind: "rides.car_assignment_changed",
        eventId: params.eventId,
        metadata: {
          eventId: params.eventId,
          eventTitle,
          rideCarId: params.carId,
          change: "removed",
        },
      });
    }
  } else {
    for (const p of passengersThisLeg) {
      await enqueueNotification({
        recipientUserId: p.event_members.userId,
        actorUserId: r.user.id,
        kind: "rides.car_assignment_changed",
        eventId: params.eventId,
        metadata: {
          eventId: params.eventId,
          eventTitle,
          rideCarId: params.carId,
          change: "removed",
        },
      });
    }
  }

  revalidatePath(`/dashboard/events/${params.eventId}`);
  return { ok: true };
}

async function assertPassengerAllowed(params: {
  eventId: string;
  carId: string;
  leg: RidePassengerLeg;
  eventMemberId: string;
}): Promise<string | null> {
  if (params.leg === RidePassengerLeg.UNIFIED) return "Invalid direction";

  const car = await prisma.eventRideCar.findFirst({
    where: { id: params.carId, eventId: params.eventId },
    select: {
      id: true,
      direction: true,
      passengerCapacity: true,
      driverEventMemberId: true,
      event_ride_passengers: {
        where: { leg: params.leg },
        select: { id: true },
      },
    },
  });
  if (!car) return "Car not found";
  if (!carCoversLeg(car.direction, params.leg))
    return "That car does not drive this direction";
  if (car.driverEventMemberId === params.eventMemberId) {
    return "Drivers are already assigned to their own car for this direction.";
  }

  const member = await prisma.eventMember.findFirst({
    where: { id: params.eventMemberId, eventId: params.eventId },
    select: { id: true },
  });
  if (!member) return "That member is not part of this event";

  const otherDriving = await prisma.eventRideCar.findFirst({
    where: {
      eventId: params.eventId,
      driverEventMemberId: params.eventMemberId,
      OR: [
        { direction: RideCarDirection.BOTH },
        {
          direction:
            params.leg === RidePassengerLeg.TO_EVENT
              ? RideCarDirection.TO_EVENT
              : RideCarDirection.FROM_EVENT,
        },
      ],
    },
    select: { id: true },
  });
  if (otherDriving) {
    return `That member is already driving another car for ${params.leg === RidePassengerLeg.TO_EVENT ? "To Event" : "From Event"}.`;
  }

  const count = car.event_ride_passengers.length;
  if (count >= car.passengerCapacity) {
    return "That car is full.";
  }

  return null;
}

export async function addRidePassenger(params: {
  eventId: string;
  carId: string;
  leg: "TO_EVENT" | "FROM_EVENT";
  eventMemberId: string;
}): Promise<MutateRidePassengerResult> {
  const r = await requireRidesEnabled(params.eventId);
  if (!r.ok) return r;
  const eventTitle = r.row.event.title;

  const leg =
    params.leg === "TO_EVENT"
      ? RidePassengerLeg.TO_EVENT
      : RidePassengerLeg.FROM_EVENT;
  const err = await assertPassengerAllowed({
    eventId: params.eventId,
    carId: params.carId,
    leg,
    eventMemberId: params.eventMemberId,
  });
  if (err) return { ok: false, error: err };

  const carWithDriver = await prisma.eventRideCar.findFirst({
    where: { id: params.carId, eventId: params.eventId },
    include: {
      driver: { select: { userId: true } },
    },
  });
  const passengerMember = await prisma.eventMember.findFirst({
    where: { id: params.eventMemberId, eventId: params.eventId },
    include: { user: { select: { id: true, name: true } } },
  });

  try {
    await prisma.event_ride_passengers.create({
      data: {
        id: crypto.randomUUID(),
        car_id: params.carId,
        event_member_id: params.eventMemberId,
        leg,
      },
    });
  } catch (e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok: false,
        error: `That member is already in another car for ${leg === RidePassengerLeg.TO_EVENT ? "To Event" : "From Event"}.`,
      };
    }
    const msg = e instanceof Error ? e.message : "Failed to add passenger";
    return { ok: false, error: msg };
  }

  if (carWithDriver && passengerMember) {
    await enqueueNotification({
      recipientUserId: carWithDriver.driver.userId,
      actorUserId: r.user.id,
      kind: "rides.passenger_joined_my_car",
      eventId: params.eventId,
      metadata: {
        eventId: params.eventId,
        eventTitle,
        rideCarId: params.carId,
        passengerUserId: passengerMember.user.id,
        passengerName: passengerMember.user.name,
        leg: params.leg,
      },
    });
    await enqueueNotification({
      recipientUserId: passengerMember.user.id,
      actorUserId: r.user.id,
      kind: "rides.car_assignment_changed",
      eventId: params.eventId,
      metadata: {
        eventId: params.eventId,
        eventTitle,
        rideCarId: params.carId,
        change: "added",
        leg: params.leg,
      },
    });
  }

  revalidatePath(`/dashboard/events/${params.eventId}`);
  return { ok: true };
}

export async function removeRidePassenger(params: {
  eventId: string;
  carId: string;
  leg: "TO_EVENT" | "FROM_EVENT";
  eventMemberId: string;
}): Promise<MutateRidePassengerResult> {
  const r = await requireRidesEnabled(params.eventId);
  if (!r.ok) return r;
  const eventTitle = r.row.event.title;

  const leg =
    params.leg === "TO_EVENT"
      ? RidePassengerLeg.TO_EVENT
      : RidePassengerLeg.FROM_EVENT;

  const memberRow = await prisma.eventMember.findFirst({
    where: { id: params.eventMemberId, eventId: params.eventId },
    select: { userId: true },
  });

  await prisma.event_ride_passengers.deleteMany({
    where: { car_id: params.carId, event_member_id: params.eventMemberId, leg },
  });

  if (memberRow) {
    await enqueueNotification({
      recipientUserId: memberRow.userId,
      actorUserId: r.user.id,
      kind: "rides.car_assignment_changed",
      eventId: params.eventId,
      metadata: {
        eventId: params.eventId,
        eventTitle,
        rideCarId: params.carId,
        change: "removed",
        leg: params.leg,
      },
    });
  }

  revalidatePath(`/dashboard/events/${params.eventId}`);
  return { ok: true };
}
