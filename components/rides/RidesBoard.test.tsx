import { RideCarDirection } from "@prisma/client";
import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
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

  it("opens car details in a dialog", async () => {
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

    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit car" }),
    ).toBeInTheDocument();
  });

  it("renders the other-direction prompt above the car-details modal", async () => {
    const user = userEvent.setup();

    const bothCar = sampleCar({
      id: "car-both",
      funName: "Both Ways",
      direction: RideCarDirection.BOTH,
      passengers: {
        TO_EVENT: [
          {
            membershipId: "m1",
            userId: "u1",
            name: "Casey Organizer",
            email: "c@example.com",
          },
        ],
        FROM_EVENT: [
          {
            membershipId: "m1",
            userId: "u1",
            name: "Casey Organizer",
            email: "c@example.com",
          },
        ],
      },
    });

    // 1st list: member is in both legs on a BOTH car.
    // 2nd list: after removing from TO_EVENT, they remain in FROM_EVENT, which triggers prompt.
    listEventRides
      .mockResolvedValueOnce({
        ok: true as const,
        event: { id: "e1", timezone: "America/Los_Angeles" },
        cars: [bothCar],
      })
      .mockResolvedValueOnce({
        ok: true as const,
        event: { id: "e1", timezone: "America/Los_Angeles" },
        cars: [
          {
            ...bothCar,
            passengers: {
              ...bothCar.passengers,
              TO_EVENT: [],
            },
          },
        ],
      });

    render(
      <RidesBoard
        eventId="e1"
        currentUserId="u1"
        defaultTimeZone="America/Los_Angeles"
        members={members}
      />,
    );

    await screen.findByText("To Event");
    await user.click(screen.getAllByRole("button", { name: "Details" })[0]!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    const promptTitle = await screen.findByText("Remove from other direction?");
    const promptOverlay = promptTitle.closest("div.fixed.inset-0");
    expect(promptOverlay).not.toBeNull();
    expect(promptOverlay).toHaveClass("z-[60]");
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
    expect(screen.getAllByRole("button", { name: "Time zone" }).length).toBe(1);
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

  it("does not prompt to add other direction if member already has a ride in that direction", async () => {
    const user = userEvent.setup();

    const carBoth = sampleCar({
      id: "car-both",
      direction: RideCarDirection.BOTH,
      passengerCapacity: 2,
      passengers: { TO_EVENT: [], FROM_EVENT: [] },
    });
    const carFromOnly = sampleCar({
      id: "car-from",
      direction: RideCarDirection.FROM_EVENT,
      passengerCapacity: 2,
      passengers: {
        TO_EVENT: [],
        FROM_EVENT: [
          {
            membershipId: "m1",
            userId: "u1",
            name: "Casey Organizer",
            email: "c@example.com",
          },
        ],
      },
    });

    // 1st list: member already has FROM_EVENT ride (in a different car), but not TO_EVENT.
    // 2nd list: after adding them to TO_EVENT on the BOTH car.
    listEventRides
      .mockResolvedValueOnce({
        ok: true as const,
        event: { id: "e1", timezone: "America/Los_Angeles" },
        cars: [carBoth, carFromOnly],
      })
      .mockResolvedValueOnce({
        ok: true as const,
        event: { id: "e1", timezone: "America/Los_Angeles" },
        cars: [
          {
            ...carBoth,
            passengers: {
              ...carBoth.passengers,
              TO_EVENT: [
                {
                  membershipId: "m1",
                  userId: "u1",
                  name: "Casey Organizer",
                  email: "c@example.com",
                },
              ],
            },
          },
          carFromOnly,
        ],
      });

    render(
      <RidesBoard
        eventId="e1"
        currentUserId="u1"
        defaultTimeZone="America/Los_Angeles"
        members={members}
      />,
    );

    await screen.findByText("To Event");
    expect(
      (await screen.findAllByText("Dana’s Subaru")).length,
    ).toBeGreaterThan(0);

    // Add passenger on the TO_EVENT leg (the BOTH car covers it).
    await user.click(
      screen.getAllByRole("button", { name: "Add Passenger" })[0]!,
    );
    await user.click(
      await screen.findByRole("button", { name: "Casey Organizer (Me)" }),
    );

    await waitFor(() => expect(addRidePassenger).toHaveBeenCalled());

    // The "other direction" prompt should NOT appear because they already have FROM_EVENT.
    expect(
      screen.queryByText("Add to other direction?"),
    ).not.toBeInTheDocument();
  });

  it("shows upsert errors inside the add-car editor", async () => {
    const user = userEvent.setup();
    upsertRideCar.mockResolvedValue({
      ok: false as const,
      error: "Duplicate driver",
    });
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
    expect(await screen.findByText("Duplicate driver")).toBeInTheDocument();
  });

  it("shows remove-passenger errors inside car details", async () => {
    const user = userEvent.setup();
    const carWithPassenger = sampleCar({
      passengers: {
        TO_EVENT: [
          {
            membershipId: "m1",
            userId: "u1",
            name: "Casey Organizer",
            email: "c@example.com",
          },
        ],
        FROM_EVENT: [],
      },
    });
    listEventRides.mockResolvedValue({
      ok: true as const,
      event: { id: "e1", timezone: "America/Los_Angeles" },
      cars: [carWithPassenger],
    });
    removeRidePassenger.mockResolvedValue({
      ok: false as const,
      error: "Cannot remove passenger",
    });
    render(
      <RidesBoard
        eventId="e1"
        currentUserId="u1"
        defaultTimeZone="America/Los_Angeles"
        members={members}
      />,
    );
    expect(await screen.findByText("Dana’s Subaru")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Details" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Cannot remove passenger",
      );
    });
  });

  it("shows 'already in another car' as a bottom-left toast that auto-dismisses", async () => {
    // Keep this test deterministic without fake timers: verify the timeout is
    // scheduled, then manually run the scheduled callback.
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    listEventRides.mockResolvedValue({
      ok: false as const,
      error: "That member is already in another car for To Event.",
    });

    render(
      <RidesBoard
        eventId="e1"
        currentUserId="u1"
        defaultTimeZone="America/Los_Angeles"
        members={members}
      />,
    );

    const toastText = "That member is already in another car for To Event.";
    expect(await screen.findByText(toastText)).toBeInTheDocument();

    // Ensure we scheduled the auto-dismiss timer.
    const timeoutCall = setTimeoutSpy.mock.calls.find(
      (c) => typeof c[0] === "function" && c[1] === 15_000,
    );
    expect(timeoutCall).toBeTruthy();

    // Run the scheduled callback to simulate time elapsing.
    (timeoutCall![0] as () => void)();
    await waitForElementToBeRemoved(() => screen.queryByText(toastText));

    setTimeoutSpy.mockRestore();
  }, 10_000);
});
