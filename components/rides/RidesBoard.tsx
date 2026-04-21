"use client";

import type { RideCarDirection } from "@prisma/client";
import { DateTime } from "luxon";
import {
  addRidePassenger,
  deleteRideCar,
  disableRideCarLeg,
  listEventRides,
  removeRidePassenger,
  upsertRideCar,
  type RideCarRow,
  type RideMemberListItem,
} from "@/app/actions/event-rides";
import {
  getTimezoneSelectChoices,
  normalizeTimeZone,
  parseEventDateTime,
  rezoneWallDatetimeLocal,
  utcToWallDatetimeLocal,
} from "@/lib/event-datetime";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";

type RidesBoardProps = {
  eventId: string;
  currentUserId: string;
  /** Event TZ when scheduled; otherwise viewer's TZ (from server). */
  defaultTimeZone: string;
  members: RideMemberListItem[];
};

type DirectionId = "TO_EVENT" | "FROM_EVENT";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}

function carDisplayName(car: RideCarRow): string {
  if (car.funName?.trim()) return car.funName.trim();
  const driverFirst =
    car.driver.name.trim().split(/\s+/)[0] || car.driver.name.trim();
  if (car.makeModel?.trim()) return `${driverFirst}’s ${car.makeModel.trim()}`;
  return `${driverFirst}’s car`;
}

function carCoversDirection(car: RideCarRow, d: DirectionId): boolean {
  if (car.direction === "BOTH") return true;
  if (car.direction === "TO_EVENT") return d === "TO_EVENT";
  return d === "FROM_EVENT";
}

function formatTime(iso: string | null, tz: string): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);
  if (!dt.isValid) return "";
  return dt.toLocaleString(DateTime.TIME_SIMPLE);
}

function otherDirection(d: DirectionId): DirectionId {
  return d === "TO_EVENT" ? "FROM_EVENT" : "TO_EVENT";
}

function isMemberDrivingForDirection(
  cars: RideCarRow[],
  membershipId: string,
  d: DirectionId,
) {
  return cars.some(
    (c) => carCoversDirection(c, d) && c.driver.membershipId === membershipId,
  );
}

function isMemberPassengerForDirection(
  cars: RideCarRow[],
  membershipId: string,
  d: DirectionId,
) {
  const leg = d;
  return cars.some((c) =>
    (leg === "TO_EVENT" ? c.passengers.TO_EVENT : c.passengers.FROM_EVENT).some(
      (p) => p.membershipId === membershipId,
    ),
  );
}

function memberHasRide(
  cars: RideCarRow[],
  membershipId: string,
  d: DirectionId,
): boolean {
  return (
    isMemberDrivingForDirection(cars, membershipId, d) ||
    isMemberPassengerForDirection(cars, membershipId, d)
  );
}

function seatCount(car: RideCarRow, d: DirectionId): number {
  return d === "TO_EVENT"
    ? car.passengers.TO_EVENT.length
    : car.passengers.FROM_EVENT.length;
}

function driverLabel(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function directionSummary(car: RideCarRow, d: DirectionId) {
  return d === "TO_EVENT"
    ? {
        placeLabel: car.toEvent.from ?? "",
        departs: car.toEvent.departsAt,
        arrives: car.toEvent.arrivesAt,
      }
    : {
        placeLabel: car.fromEvent.to ?? "",
        departs: car.fromEvent.departsAt,
        arrives: car.fromEvent.arrivesAt,
      };
}

type CarEditorState = {
  open: boolean;
  carId: string | null;
  driverEventMemberId: string;
  passengerCapacity: string;
  toEnabled: boolean;
  fromEnabled: boolean;
  makeModel: string;
  funName: string;
  notes: string;
  toFrom: string;
  toDepartsWall: string;
  toArrivesWall: string;
  fromTo: string;
  fromDepartsWall: string;
  fromArrivesWall: string;
  tab: DirectionId;
  /** IANA zone used to interpret the datetime-local fields below. */
  timesTimeZone: string;
};

type PassengerPickerState =
  | { open: false }
  | { open: true; carId: string; leg: DirectionId };

function emptyEditor(
  members: RideMemberListItem[],
  tab: DirectionId,
  defaultTimeZone: string,
): CarEditorState {
  const tz = normalizeTimeZone(defaultTimeZone, defaultTimeZone);
  return {
    open: false,
    carId: null,
    driverEventMemberId: members[0]?.membershipId ?? "",
    passengerCapacity: "3",
    toEnabled: true,
    fromEnabled: false,
    makeModel: "",
    funName: "",
    notes: "",
    toFrom: "",
    toDepartsWall: "",
    toArrivesWall: "",
    fromTo: "",
    fromDepartsWall: "",
    fromArrivesWall: "",
    tab,
    timesTimeZone: tz,
  };
}

function editorFromCar(
  car: RideCarRow,
  displayTimeZone: string,
  members: RideMemberListItem[],
  tab: DirectionId,
): CarEditorState {
  const tz = normalizeTimeZone(displayTimeZone, displayTimeZone);
  const toEnabled = car.direction === "BOTH" || car.direction === "TO_EVENT";
  const fromEnabled =
    car.direction === "BOTH" || car.direction === "FROM_EVENT";
  return {
    open: false,
    carId: car.id,
    driverEventMemberId:
      members.find((m) => m.membershipId === car.driver.membershipId)
        ?.membershipId ??
      members[0]?.membershipId ??
      car.driver.membershipId,
    passengerCapacity: String(car.passengerCapacity),
    toEnabled,
    fromEnabled,
    makeModel: car.makeModel ?? "",
    funName: car.funName ?? "",
    notes: car.notes ?? "",
    toFrom: car.toEvent.from ?? "",
    toDepartsWall: utcToWallDatetimeLocal(car.toEvent.departsAt, tz),
    toArrivesWall: utcToWallDatetimeLocal(car.toEvent.arrivesAt, tz),
    fromTo: car.fromEvent.to ?? "",
    fromDepartsWall: utcToWallDatetimeLocal(car.fromEvent.departsAt, tz),
    fromArrivesWall: utcToWallDatetimeLocal(car.fromEvent.arrivesAt, tz),
    tab,
    timesTimeZone: tz,
  };
}

function directionFromEnabled(
  toEnabled: boolean,
  fromEnabled: boolean,
): RideCarDirection | null {
  if (toEnabled && fromEnabled) return "BOTH";
  if (toEnabled) return "TO_EVENT";
  if (fromEnabled) return "FROM_EVENT";
  return null;
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

type NeedsRideByLeg = {
  TO_EVENT: RideMemberListItem[];
  FROM_EVENT: RideMemberListItem[];
};

function PassengerPickerModal({
  open,
  carId,
  leg,
  cars,
  needsRide,
  currentUserId,
  isPending,
  onClose,
  onPick,
}: {
  open: boolean;
  carId: string | null;
  leg: DirectionId;
  cars: RideCarRow[];
  needsRide: NeedsRideByLeg;
  currentUserId: string;
  isPending: boolean;
  onClose: () => void;
  onPick: (params: {
    car: RideCarRow;
    leg: DirectionId;
    membershipId: string;
  }) => void;
}) {
  const { car, list, legLabel } = useMemo(() => {
    if (!open || !carId) {
      return {
        car: null as RideCarRow | null,
        list: [] as RideMemberListItem[],
        legLabel: "To Event" as const,
      };
    }

    const car = cars.find((c) => c.id === carId) ?? null;
    const legLabel = leg === "TO_EVENT" ? "To Event" : "From Event";
    const list = car
      ? (leg === "TO_EVENT" ? needsRide.TO_EVENT : needsRide.FROM_EVENT)
          .slice()
          .sort((a, b) => {
            const aIsMe = a.userId === currentUserId;
            const bIsMe = b.userId === currentUserId;
            if (aIsMe && !bIsMe) return -1;
            if (bIsMe && !aIsMe) return 1;
            return a.name.localeCompare(b.name);
          })
      : [];

    return { car, list, legLabel };
  }, [open, carId, cars, leg, needsRide, currentUserId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Add passenger • {legLabel}
          </div>
          <button
            type="button"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {car ? (
            <div className="text-sm text-gray-700 dark:text-gray-200">
              Choose someone who still needs a ride for this direction.
            </div>
          ) : (
            <div
              className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/60 dark:bg-yellow-950/30 dark:text-yellow-200"
              role="alert"
            >
              Ride data is still loading. Please try again in a moment.
            </div>
          )}

          {car && list.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-200">
              Everyone is already assigned.
            </div>
          ) : car ? (
            <div className="max-h-80 overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
              {list.map((m) => {
                const isMe = m.userId === currentUserId;
                return (
                  <button
                    key={`pick:${leg}:${car.id}:${m.membershipId}`}
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      onPick({ car, leg, membershipId: m.membershipId })
                    }
                    className="flex w-full items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900/30"
                  >
                    <span className="font-medium">
                      {isMe ? `${m.name} (Me)` : m.name}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
              disabled={isPending}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RidesBoard({
  eventId,
  currentUserId,
  defaultTimeZone,
  members,
}: RidesBoardProps) {
  const displayTimeZone = useMemo(
    () => normalizeTimeZone(defaultTimeZone, defaultTimeZone),
    [defaultTimeZone],
  );
  const [cars, setCars] = useState<RideCarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [editor, setEditor] = useState<CarEditorState>(() =>
    emptyEditor(members, "TO_EVENT", defaultTimeZone),
  );
  const [passengerPicker, setPassengerPicker] = useState<PassengerPickerState>({
    open: false,
  });
  const [deletePrompt, setDeletePrompt] = useState<{
    open: boolean;
    car: RideCarRow | null;
    leg: DirectionId;
  }>({ open: false, car: null, leg: "TO_EVENT" });

  function refresh() {
    setLoading(true);
    setError(null);
    startTransition(async () => {
      const r = await listEventRides(eventId);
      if (!r.ok) {
        setError(r.error);
        setCars([]);
        setLoading(false);
        return;
      }
      setCars(r.cars);
      setLoading(false);
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const editorTimezoneChoices = useMemo(
    () => getTimezoneSelectChoices(editor.timesTimeZone),
    [editor.timesTimeZone],
  );

  const needsRide = useMemo(() => {
    return {
      TO_EVENT: members.filter(
        (m) => !memberHasRide(cars, m.membershipId, "TO_EVENT"),
      ),
      FROM_EVENT: members.filter(
        (m) => !memberHasRide(cars, m.membershipId, "FROM_EVENT"),
      ),
    };
  }, [cars, members]);

  function NeedsRidePanel({ d }: { d: DirectionId }) {
    const list = d === "TO_EVENT" ? needsRide.TO_EVENT : needsRide.FROM_EVENT;
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="space-y-1 text-sm text-gray-800 dark:text-gray-200">
          {list.length === 0 ? (
            <div className="text-gray-500">Everyone has a ride!</div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3 pb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  Needs a Ride: <strong>{list.length}</strong>
                </div>
              </div>
              {list.slice(0, 12).map((m) => (
                <div key={`${d}:need:${m.membershipId}`}>{m.name}</div>
              ))}
              {list.length > 12 && (
                <div className="text-gray-500">+ {list.length - 12} more</div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  function openCreate(tab: DirectionId) {
    setEditor(() => {
      const next = emptyEditor(members, tab, defaultTimeZone);
      next.open = true;
      return next;
    });
  }

  function openEdit(car: RideCarRow, tab: DirectionId) {
    setEditor(() => {
      const next = editorFromCar(car, displayTimeZone, members, tab);
      next.open = true;
      return next;
    });
  }

  async function saveCar() {
    setError(null);
    const direction = directionFromEnabled(
      editor.toEnabled,
      editor.fromEnabled,
    );
    if (!direction) {
      setError("Choose To Event and/or From Event for this car.");
      return;
    }
    const cap = Number(editor.passengerCapacity);
    if (!Number.isInteger(cap) || cap < 0) {
      setError("Passenger capacity must be an integer ≥ 0.");
      return;
    }

    const tzForSave = normalizeTimeZone(editor.timesTimeZone, displayTimeZone);
    const toDepartsAt = editor.toDepartsWall
      ? (parseEventDateTime(editor.toDepartsWall, tzForSave)?.toISOString() ??
        null)
      : null;
    const toArrivesAt = editor.toArrivesWall
      ? (parseEventDateTime(editor.toArrivesWall, tzForSave)?.toISOString() ??
        null)
      : null;
    const fromDepartsAt = editor.fromDepartsWall
      ? (parseEventDateTime(editor.fromDepartsWall, tzForSave)?.toISOString() ??
        null)
      : null;
    const fromArrivesAt = editor.fromArrivesWall
      ? (parseEventDateTime(editor.fromArrivesWall, tzForSave)?.toISOString() ??
        null)
      : null;

    startTransition(async () => {
      const r = await upsertRideCar({
        eventId,
        carId: editor.carId ?? undefined,
        driverEventMemberId: editor.driverEventMemberId,
        passengerCapacity: cap,
        direction,
        makeModel: editor.makeModel || null,
        funName: editor.funName || null,
        notes: editor.notes || null,
        toEvent: {
          from: editor.toFrom || null,
          departsAt: toDepartsAt,
          arrivesAt: toArrivesAt,
        },
        fromEvent: {
          to: editor.fromTo || null,
          departsAt: fromDepartsAt,
          arrivesAt: fromArrivesAt,
        },
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditor((e) => ({ ...e, open: false }));
      refresh();
    });
  }

  async function doDeleteCar(carId: string) {
    if (!confirm("Delete this car? This removes all sign-ups.")) return;
    await deleteCarConfirmed(carId);
  }

  async function deleteCarConfirmed(carId: string) {
    startTransition(async () => {
      const r = await deleteRideCar(eventId, carId);
      if (!r.ok) setError(r.error);
      refresh();
    });
  }

  async function disableLegConfirmed(car: RideCarRow, d: DirectionId) {
    startTransition(async () => {
      const r = await disableRideCarLeg({ eventId, carId: car.id, leg: d });
      if (!r.ok) setError(r.error);
      refresh();
    });
  }

  function requestDelete(car: RideCarRow, leg: DirectionId) {
    if (car.direction === "BOTH") {
      setDeletePrompt({ open: true, car, leg });
      return;
    }
    // Single-leg cars: deleting the "leg" is the same as deleting the car.
    doDeleteCar(car.id);
  }

  async function doAddPassenger(
    car: RideCarRow,
    d: DirectionId,
    membershipId: string,
  ) {
    setError(null);
    startTransition(async () => {
      const r = await addRidePassenger({
        eventId,
        carId: car.id,
        leg: d,
        eventMemberId: membershipId,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (car.direction === "BOTH") {
        const other = otherDirection(d);
        const ok = confirm(
          `Also add them for ${other === "TO_EVENT" ? "To Event" : "From Event"}?`,
        );
        if (ok) {
          await addRidePassenger({
            eventId,
            carId: car.id,
            leg: other,
            eventMemberId: membershipId,
          });
        }
      }
      refresh();
    });
  }

  async function doRemovePassenger(
    car: RideCarRow,
    d: DirectionId,
    membershipId: string,
  ) {
    setError(null);
    startTransition(async () => {
      const r = await removeRidePassenger({
        eventId,
        carId: car.id,
        leg: d,
        eventMemberId: membershipId,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (car.direction === "BOTH") {
        const other = otherDirection(d);
        const otherHas = memberHasRide([car], membershipId, other);
        if (otherHas) {
          const ok = confirm(
            `Also remove them for ${other === "TO_EVENT" ? "To Event" : "From Event"}?`,
          );
          if (ok) {
            await removeRidePassenger({
              eventId,
              carId: car.id,
              leg: other,
              eventMemberId: membershipId,
            });
          }
        }
      }
      refresh();
    });
  }

  function CarsTable({ d }: { d: DirectionId }) {
    const rows = cars.filter((c) => carCoversDirection(c, d));
    const headerPlace = d === "TO_EVENT" ? "From" : "To";

    return (
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
                <th className="px-5 py-3">Car / Driver</th>
                <th className="px-5 py-3">{headerPlace}</th>
                <th className="px-5 py-3">Departs</th>
                <th className="px-5 py-3">Arrives</th>
                <th className="px-5 py-3">Passengers</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-6 text-sm text-gray-600 dark:text-gray-300"
                  >
                    No cars yet.
                  </td>
                </tr>
              ) : (
                rows.map((car) => {
                  const key = `${car.id}:${d}`;
                  const isOpen = expanded[key] ?? false;
                  const sum = directionSummary(car, d);
                  const filled = seatCount(car, d);
                  const open = Math.max(0, car.passengerCapacity - filled);
                  const canAddPassenger = open > 0;
                  const actionLabel = open <= 0 ? "Full" : "Add Passenger";

                  return (
                    <Fragment key={key}>
                      <tr
                        className="cursor-pointer border-t border-gray-100 hover:bg-gray-50/70 dark:border-gray-700 dark:hover:bg-gray-900/30"
                        onClick={() =>
                          setExpanded((e) => ({ ...e, [key]: !isOpen }))
                        }
                      >
                        <td className="px-5 py-4">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {carDisplayName(car)}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-300">
                            {driverLabel(car.driver.name)}
                          </div>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            className="mt-1 text-left text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpanded((prev) => ({
                                ...prev,
                                [key]: !isOpen,
                              }));
                            }}
                          >
                            {isOpen ? "Show less" : "Show more"}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-800 dark:text-gray-200">
                          {sum.placeLabel || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-800 dark:text-gray-200">
                          {formatTime(sum.departs, displayTimeZone) || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-800 dark:text-gray-200">
                          {formatTime(sum.arrives, displayTimeZone) || (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {(d === "TO_EVENT"
                              ? car.passengers.TO_EVENT
                              : car.passengers.FROM_EVENT
                            ).map((p) => (
                              <span
                                key={p.membershipId}
                                className="inline-flex size-7 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                                title={p.name}
                              >
                                {initials(p.name)}
                              </span>
                            ))}
                            {Array.from({ length: open }).map((_, i) => (
                              <button
                                key={`open:${i}`}
                                type="button"
                                disabled={!canAddPassenger}
                                aria-label="Add passenger"
                                className="inline-flex size-7 items-center justify-center rounded-full border border-dashed border-gray-300 text-xs font-semibold text-gray-400 hover:border-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:text-gray-200"
                                title="Add passenger"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!canAddPassenger) return;
                                  setPassengerPicker({
                                    open: true,
                                    carId: car.id,
                                    leg: d,
                                  });
                                }}
                              >
                                +
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            disabled={!canAddPassenger}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!canAddPassenger) return;
                              setPassengerPicker({
                                open: true,
                                carId: car.id,
                                leg: d,
                              });
                            }}
                            className={
                              canAddPassenger
                                ? "relative z-10 inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
                                : "relative z-10 inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-500"
                            }
                            title={
                              canAddPassenger
                                ? "Add a passenger who needs a ride"
                                : "Full"
                            }
                          >
                            {actionLabel}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-gray-100 dark:border-gray-700">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="space-y-3">
                              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Passengers
                              </div>
                              <div className="space-y-2">
                                {(d === "TO_EVENT"
                                  ? car.passengers.TO_EVENT
                                  : car.passengers.FROM_EVENT
                                ).length === 0 ? (
                                  <div className="text-sm text-gray-600 dark:text-gray-300">
                                    No passengers yet.
                                  </div>
                                ) : (
                                  (d === "TO_EVENT"
                                    ? car.passengers.TO_EVENT
                                    : car.passengers.FROM_EVENT
                                  ).map((p) => (
                                    <div
                                      key={`${key}:p:${p.membershipId}`}
                                      className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900/30"
                                    >
                                      <span className="text-gray-900 dark:text-gray-100">
                                        {p.name}
                                      </span>
                                      <button
                                        type="button"
                                        className="text-sm font-medium text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                                        disabled={isPending}
                                        onClick={() =>
                                          doRemovePassenger(
                                            car,
                                            d,
                                            p.membershipId,
                                          )
                                        }
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>

                              <div className="flex flex-wrap items-end gap-3 pt-2">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
                                    disabled={isPending}
                                    onClick={() => openEdit(car, d)}
                                  >
                                    Edit car
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Delete"
                                    title={
                                      car.direction === "BOTH"
                                        ? "Delete (choose leg or both)"
                                        : "Delete"
                                    }
                                    className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-200 dark:hover:bg-gray-900/50"
                                    disabled={isPending}
                                    onClick={() => requestDelete(car, d)}
                                  >
                                    <TrashIcon className="size-5" />
                                  </button>
                                </div>
                              </div>

                              {car.notes?.trim() && (
                                <div className="pt-2 text-sm text-gray-700 dark:text-gray-200">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                    Notes
                                  </div>
                                  <div className="mt-1 whitespace-pre-wrap">
                                    {car.notes}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800">
        <div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Rides
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Coordinate drivers, cars, and passengers to and from your event.
          </div>
        </div>
        <button
          type="button"
          onClick={() => openCreate("TO_EVENT")}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={isPending}
        >
          Add car
        </button>
      </div>

      {error && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Loading rides…
        </div>
      ) : (
        <div className="space-y-10">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                To Event
              </h3>
            </div>
            <div className="space-y-4">
              <NeedsRidePanel d="TO_EVENT" />
              <CarsTable d="TO_EVENT" />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                From Event
              </h3>
            </div>
            <div className="space-y-4">
              <NeedsRidePanel d="FROM_EVENT" />
              <CarsTable d="FROM_EVENT" />
            </div>
          </section>
        </div>
      )}

      {editor.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {editor.carId ? "Edit car" : "Add car"}
              </div>
              <button
                type="button"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                onClick={() => setEditor((e) => ({ ...e, open: false }))}
              >
                Close
              </button>
            </div>

            <div className="space-y-6 px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Driver
                  </label>
                  <select
                    value={editor.driverEventMemberId}
                    onChange={(e) =>
                      setEditor((s) => ({
                        ...s,
                        driverEventMemberId: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                  >
                    {members.map((m) => (
                      <option key={m.membershipId} value={m.membershipId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Passenger capacity
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editor.passengerCapacity}
                    onChange={(e) =>
                      setEditor((s) => ({
                        ...s,
                        passengerCapacity: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Make / model (optional)
                  </label>
                  <input
                    value={editor.makeModel}
                    onChange={(e) =>
                      setEditor((s) => ({ ...s, makeModel: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                    placeholder="Honda CR‑V ’22"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Fun car name (optional)
                  </label>
                  <input
                    value={editor.funName}
                    onChange={(e) =>
                      setEditor((s) => ({ ...s, funName: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                    placeholder="The Party Bus"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={editor.toEnabled}
                    onChange={(e) =>
                      setEditor((s) => ({ ...s, toEnabled: e.target.checked }))
                    }
                    className="mt-1"
                  />
                  To Event
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={editor.fromEnabled}
                    onChange={(e) =>
                      setEditor((s) => ({
                        ...s,
                        fromEnabled: e.target.checked,
                      }))
                    }
                    className="mt-1"
                  />
                  From Event
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  Timezone for departure & arrival times
                </label>
                <select
                  value={editor.timesTimeZone}
                  onChange={(e) => {
                    const next = normalizeTimeZone(
                      e.target.value,
                      displayTimeZone,
                    );
                    setEditor((s) => {
                      const from = s.timesTimeZone;
                      return {
                        ...s,
                        timesTimeZone: next,
                        toDepartsWall: rezoneWallDatetimeLocal(
                          s.toDepartsWall,
                          from,
                          next,
                        ),
                        toArrivesWall: rezoneWallDatetimeLocal(
                          s.toArrivesWall,
                          from,
                          next,
                        ),
                        fromDepartsWall: rezoneWallDatetimeLocal(
                          s.fromDepartsWall,
                          from,
                          next,
                        ),
                        fromArrivesWall: rezoneWallDatetimeLocal(
                          s.fromArrivesWall,
                          from,
                          next,
                        ),
                      };
                    });
                  }}
                  className="mt-1 w-full max-w-md rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                >
                  {editorTimezoneChoices.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.choices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
                {(["TO_EVENT", "FROM_EVENT"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditor((s) => ({ ...s, tab: t }))}
                    className={
                      editor.tab === t
                        ? "rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                        : "rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    }
                  >
                    {t === "TO_EVENT" ? "To Event info" : "From Event info"}
                  </button>
                ))}
              </div>

              {editor.tab === "TO_EVENT" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      From (optional)
                    </label>
                    <input
                      value={editor.toFrom}
                      onChange={(e) =>
                        setEditor((s) => ({ ...s, toFrom: e.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                      placeholder="Seattle"
                    />
                  </div>
                  <div />
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      Departs (optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={editor.toDepartsWall}
                      onChange={(e) =>
                        setEditor((s) => ({
                          ...s,
                          toDepartsWall: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      Arrives (optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={editor.toArrivesWall}
                      onChange={(e) =>
                        setEditor((s) => ({
                          ...s,
                          toArrivesWall: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      To (optional)
                    </label>
                    <input
                      value={editor.fromTo}
                      onChange={(e) =>
                        setEditor((s) => ({ ...s, fromTo: e.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                      placeholder="Bellevue"
                    />
                  </div>
                  <div />
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      Departs (optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={editor.fromDepartsWall}
                      onChange={(e) =>
                        setEditor((s) => ({
                          ...s,
                          fromDepartsWall: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      Arrives (optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={editor.fromArrivesWall}
                      onChange={(e) =>
                        setEditor((s) => ({
                          ...s,
                          fromArrivesWall: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  Notes (optional)
                </label>
                <textarea
                  value={editor.notes}
                  onChange={(e) =>
                    setEditor((s) => ({ ...s, notes: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setEditor((e) => ({ ...e, open: false }))}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCar}
                disabled={isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletePrompt.open && deletePrompt.car && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Delete car
              </div>
              <button
                type="button"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                onClick={() =>
                  setDeletePrompt({ open: false, car: null, leg: "TO_EVENT" })
                }
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="text-sm text-gray-800 dark:text-gray-200">
                This car has rides for <strong>To</strong> and{" "}
                <strong>From</strong> legs. What do you want to delete?
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
                  disabled={isPending}
                  onClick={() =>
                    setDeletePrompt({ open: false, car: null, leg: "TO_EVENT" })
                  }
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-100 dark:hover:bg-gray-900/50"
                  disabled={isPending}
                  onClick={async () => {
                    const car = deletePrompt.car;
                    if (!car) return;
                    const leg = deletePrompt.leg;
                    setDeletePrompt({
                      open: false,
                      car: null,
                      leg: "TO_EVENT",
                    });
                    await disableLegConfirmed(car, leg);
                  }}
                >
                  Just this leg
                </button>
                <button
                  type="button"
                  className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 shadow-sm hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                  disabled={isPending}
                  onClick={async () => {
                    const carId = deletePrompt.car?.id;
                    setDeletePrompt({
                      open: false,
                      car: null,
                      leg: "TO_EVENT",
                    });
                    if (carId) await deleteCarConfirmed(carId);
                  }}
                >
                  Both legs
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PassengerPickerModal
        open={passengerPicker.open}
        carId={passengerPicker.open ? passengerPicker.carId : null}
        leg={passengerPicker.open ? passengerPicker.leg : "TO_EVENT"}
        cars={cars}
        needsRide={needsRide}
        currentUserId={currentUserId}
        isPending={isPending}
        onClose={() => setPassengerPicker({ open: false })}
        onPick={({ car, leg, membershipId }) => {
          setPassengerPicker({ open: false });
          doAddPassenger(car, leg, membershipId);
        }}
      />
    </div>
  );
}
