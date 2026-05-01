import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/user", () => ({ getOrCreateUser: vi.fn() }));
vi.mock("@/lib/events", () => ({ getEventsForUser: vi.fn() }));

import { currentUser } from "@clerk/nextjs/server";
import { getEventsForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";
import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to sign-in when there is no Clerk user", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("renders welcome and empty state when there are no events", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "c1" } as Awaited<
      ReturnType<typeof currentUser>
    >);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "u1",
      name: "Alex",
      timezone: "UTC",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);
    vi.mocked(getEventsForUser).mockResolvedValue([]);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByText(/Welcome, Alex!/)).toBeInTheDocument();
    expect(screen.getByText(/No events yet/)).toBeInTheDocument();
  });

  it("lists events with role badge", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "c1" } as Awaited<
      ReturnType<typeof currentUser>
    >);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "u1",
      name: "Alex",
      timezone: "UTC",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);
    vi.mocked(getEventsForUser).mockResolvedValue([
      {
        event: {
          id: "e1",
          title: "Camping",
          startAt: new Date("2099-06-01T12:00:00Z"),
          endAt: new Date("2099-06-02T12:00:00Z"),
          startAtTimeZone: "UTC",
          endAtTimeZone: "UTC",
          location: "Yosemite",
        },
        role: "creator",
      },
    ] as Awaited<ReturnType<typeof getEventsForUser>>);
    const ui = await DashboardPage();
    render(ui);
    expect(screen.getByText("Camping")).toBeInTheDocument();
    expect(screen.getByText("Yosemite")).toBeInTheDocument();
    expect(screen.getByText("Organizer")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Upcoming/i }),
    ).toBeInTheDocument();
  });

  it("lists undated events under their own heading above Upcoming", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "c1" } as Awaited<
      ReturnType<typeof currentUser>
    >);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "u1",
      name: "Alex",
      timezone: "UTC",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);
    vi.mocked(getEventsForUser).mockResolvedValue([
      {
        event: {
          id: "e-dated",
          title: "Summer trip",
          startAt: new Date("2099-06-01T12:00:00Z"),
          endAt: new Date("2099-06-02T12:00:00Z"),
          startAtTimeZone: "UTC",
          endAtTimeZone: "UTC",
          location: null,
        },
        role: "member",
      },
      {
        event: {
          id: "e-undated",
          title: "TBD meetup",
          startAt: null,
          endAt: null,
          startAtTimeZone: "UTC",
          endAtTimeZone: "UTC",
          location: null,
        },
        role: "member",
      },
    ] as Awaited<ReturnType<typeof getEventsForUser>>);
    const ui = await DashboardPage();
    render(ui);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings[0]).toHaveTextContent(/Events without a date/i);
    expect(headings[1]).toHaveTextContent(/Upcoming/i);
    expect(screen.getByText("TBD meetup")).toBeInTheDocument();
    expect(screen.getByText("Summer trip")).toBeInTheDocument();
  });

  it("shows See Past Events when there are ended events", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "c1" } as Awaited<
      ReturnType<typeof currentUser>
    >);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "u1",
      name: "Alex",
      timezone: "UTC",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);
    vi.mocked(getEventsForUser).mockResolvedValue([
      {
        event: {
          id: "e-past",
          title: "Old camp",
          startAt: new Date("2000-01-01T12:00:00Z"),
          endAt: new Date("2000-01-02T12:00:00Z"),
          startAtTimeZone: "UTC",
          endAtTimeZone: "UTC",
          location: null,
        },
        role: "member",
      },
    ] as Awaited<ReturnType<typeof getEventsForUser>>);
    const ui = await DashboardPage();
    render(ui);
    expect(
      screen.getByRole("link", { name: /See Past Events/i }),
    ).toHaveAttribute("href", "/dashboard/events/past");
    expect(
      screen.getByText(/No upcoming events on your calendar/i),
    ).toBeInTheDocument();
  });
});
