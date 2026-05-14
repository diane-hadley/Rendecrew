import type { RideCarDirection } from "@prisma/client";

export type RideMemberListItem = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
};

export type RidePassenger = {
  membershipId: string;
  userId: string;
  name: string;
};

export type RideCarRow = {
  id: string;
  eventId: string;
  driver: RideMemberListItem;
  passengerCapacity: number;
  direction: RideCarDirection;
  makeModel: string | null;
  funName: string | null;
  notes: string | null;
  toEvent: {
    from: string | null;
    departsAt: string | null;
    departsAtTimeZone: string | null;
    arrivesAt: string | null;
    arrivesAtTimeZone: string | null;
  };
  fromEvent: {
    to: string | null;
    departsAt: string | null;
    departsAtTimeZone: string | null;
    arrivesAt: string | null;
    arrivesAtTimeZone: string | null;
  };
  passengers: {
    TO_EVENT: RidePassenger[];
    FROM_EVENT: RidePassenger[];
  };
};

export type ListEventRidesResult =
  | {
      ok: true;
      event: { id: string; startAtTimeZone: string; endAtTimeZone: string };
      cars: RideCarRow[];
    }
  | { ok: false; error: string };

export type MutateRidePassengerResult =
  | { ok: true }
  | { ok: false; error: string };
