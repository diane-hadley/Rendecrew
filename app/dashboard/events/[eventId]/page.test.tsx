import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, notFound } = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/user", () => ({ getOrCreateUser: vi.fn() }));
vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
  canManageEvent: vi.fn(),
}));
vi.mock("@/lib/packing-list", () => ({
  getPackingListForEvent: vi.fn(),
  listPackingCommitmentsForUser: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    packingSuggestion: { count: vi.fn().mockResolvedValue(0) },
  },
}));
vi.mock("@/components/events/EventDetailClient", () => ({
  EventDetailClient: () => <div data-testid="event-detail-client">Detail</div>,
}));
vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div>UserButton</div>,
}));

import { currentUser } from "@clerk/nextjs/server";
import { canManageEvent, getEventForUser } from "@/lib/events";
import {
  getPackingListForEvent,
  listPackingCommitmentsForUser,
} from "@/lib/packing-list";
import { getOrCreateUser } from "@/lib/user";
import EventDetailPage from "./page";

describe("EventDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canManageEvent).mockReturnValue(true);
    vi.mocked(getPackingListForEvent).mockResolvedValue(null);
    vi.mocked(listPackingCommitmentsForUser).mockReturnValue([]);
  });

  it("redirects when not signed in", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    await expect(
      EventDetailPage({ params: { eventId: "e1" } }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("calls notFound when the user cannot see the event", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "c1" } as Awaited<
      ReturnType<typeof currentUser>
    >);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "u1",
      name: "Alex",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);
    vi.mocked(getEventForUser).mockResolvedValue(null);
    await expect(
      EventDetailPage({ params: { eventId: "missing" } }),
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders EventDetailClient when the event exists", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "c1" } as Awaited<
      ReturnType<typeof currentUser>
    >);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "u1",
      name: "Alex",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: {
        id: "e1",
        title: "Trip",
        description: "Fun",
        location: "Beach",
        startAt: new Date("2026-07-01T10:00:00Z"),
        endAt: new Date("2026-07-02T10:00:00Z"),
        suggestionApprovalRequired: false,
      },
      role: "member",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    vi.mocked(canManageEvent).mockReturnValue(false);

    const ui = await EventDetailPage({ params: { eventId: "e1" } });
    render(ui);
    expect(screen.getByTestId("event-detail-client")).toBeInTheDocument();
  });
});
