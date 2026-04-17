import { RideCarDirection } from "@prisma/client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RideCarRow } from "@/app/actions/event-rides";
import { RidesBoard } from "./RidesBoard";

const listEventRides = vi.fn();
const upsertRideCar = vi.fn();
const deleteRideCar = vi.fn();
const disableRideCarLeg = vi.fn();
const addRidePassenger = vi.fn();
const removeRidePassenger = vi.fn();

vi.mock("@/app/actions/event-rides", () => ({
  listEventRides: (...a: unknown[]) => listEventRides(...a),
  upsertRideCar: (...a: unknown[]) => upsertRideCar(...a),
  deleteRideCar: (...a: unknown[]) => deleteRideCar(...a),
  disableRideCarLeg: (...a: unknown[]) => disableRideCarLeg(...a),
  addRidePassenger: (...a: unknown[]) => addRidePassenger(...a),
  removeRidePassenger: (...a: unknown[]) => removeRidePassenger(...a),
}));

const members = [
  {
    membershipId: "m1",
    userId: "u1",
    name: "Casey Organizer",
    email: "c@example.com",
  },
  {
    membershipId: "m2",
    userId: "u2",
    name: "Dana Driver",
    email: "d@example.com",
  },
];

function sampleCar(overrides: Partial<RideCarRow> = {}): RideCarRow {
  return {
    id: "car-1",
    eventId: "e1",
    driver: {
      membershipId: "m2",
      userId: "u2",
      name: "Dana Driver",
      email: "d@example.com",
    },
    passengerCapacity: 2,
    direction: RideCarDirection.TO_EVENT,
    makeModel: "Subaru",
    funName: null,
    notes: null,
    toEvent: {
      from: "Tacoma",
      departsAt: "2026-07-04T14:00:00.000Z",
      arrivesAt: "2026-07-04T15:30:00.000Z",
    },
    fromEvent: {
      to: null,
      departsAt: null,
      arrivesAt: null,
    },
    passengers: { TO_EVENT: [], FROM_EVENT: [] },
    ...overrides,
  };
}

describe("RidesBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listEventRides.mockResolvedValue({
      ok: true as const,
      event: { id: "e1", timezone: "America/Los_Angeles" },
      cars: [],
    });
    upsertRideCar.mockResolvedValue({ ok: true as const, carId: "car-1" });
    deleteRideCar.mockResolvedValue({ ok: true as const });
    disableRideCarLeg.mockResolvedValue({ ok: true as const });
    addRidePassenger.mockResolvedValue({ ok: true as const });
    removeRidePassenger.mockResolvedValue({ ok: true as const });
  });

  it("loads rides on mount", async () => {
    render(
      <RidesBoard
        eventId="e1"
        currentUserId="u1"
        defaultTimeZone="America/Los_Angeles"
        members={members}
      />,
    );
    expect(listEventRides).toHaveBeenCalledWith("e1");
    expect(await screen.findByText("To Event")).toBeInTheDocument();
    expect(screen.getAllByText("No cars yet.")).toHaveLength(2);
  });

  it("shows an error when listing fails", async () => {
    listEventRides.mockResolvedValue({
      ok: false as const,
      error: "Rides are offline",
    });
    render(
      <RidesBoard
        eventId="e1"
        currentUserId="u1"
        defaultTimeZone="UTC"
        members={members}
      />,
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Rides are offline");
  });

  it("renders a car row and expands details", async () => {
    const user = userEvent.setup();
    listEventRides.mockResolvedValue({
      ok: true as const,
      event: { id: "e1", timezone: "America/Los_Angeles" },
      cars: [sampleCar({ funName: "The Shuttle" })],
    });
    render(
      <RidesBoard
        eventId="e1"
        currentUserId="u1"
        defaultTimeZone="America/Los_Angeles"
        members={members}
      />,
    );
    expect(await screen.findByText("The Shuttle")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(
      screen.getByRole("button", { name: "Show less" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit car" }),
    ).toBeInTheDocument();
  });

  it("opens the add-car modal", async () => {
    const user = userEvent.setup();
    render(
      <RidesBoard
        eventId="e1"
        currentUserId="u1"
        defaultTimeZone="UTC"
        members={members}
      />,
    );
    await screen.findByText("To Event");
    await user.click(screen.getByRole("button", { name: "Add car" }));
    expect(screen.getAllByText("Add car").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("Timezone for departure & arrival times"),
    ).toBeInTheDocument();
  });

  it("submits a new car via Save", async () => {
    const user = userEvent.setup();
    render(
      <RidesBoard
        eventId="e1"
        currentUserId="u1"
        defaultTimeZone="America/Los_Angeles"
        members={members}
      />,
    );
    await screen.findByText("To Event");
    await user.click(screen.getByRole("button", { name: "Add car" }));

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(upsertRideCar).toHaveBeenCalled();
    });
    const payload = vi.mocked(upsertRideCar).mock.calls[0][0];
    expect(payload).toMatchObject({
      eventId: "e1",
      driverEventMemberId: "m1",
      direction: "TO_EVENT",
    });
  });
});
