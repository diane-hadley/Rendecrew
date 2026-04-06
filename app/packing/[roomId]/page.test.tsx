import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/user", () => ({ getOrCreateUser: vi.fn() }));
vi.mock("@/lib/packing-list", () => ({
  getPackingListByRoomId: vi.fn(),
  listPackingCommitmentsForUser: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
  canManageEvent: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findUnique: vi.fn().mockResolvedValue({
        suggestionApprovalRequired: false,
      }),
    },
    packingSuggestion: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userSuggestionState: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    personalPackingItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));
const capturePackingProps = vi.hoisted(() => vi.fn());

vi.mock("@/components/packing/PackingCollabPage", () => ({
  PackingCollabPage: (props: {
    authUser: { dbUserId: string; name: string; email: string } | null;
  }) => {
    capturePackingProps(props);
    return <div data-testid="packing-collab">Collab</div>;
  },
}));

import { currentUser } from "@clerk/nextjs/server";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { getPackingListByRoomId } from "@/lib/packing-list";
import { getOrCreateUser } from "@/lib/user";
import PublicPackingPage from "./page";

const mockList = {
  liveblocksRoomId: "room-xyz",
  event: { id: "e1", title: "Weekend trip" },
  items: [
    {
      id: "i1",
      section: "Gear",
      name: "Tent",
      quantity: 1,
      quantityMax: null,
      signUps: [
        {
          id: "s1",
          quantity: 1,
          displayName: "Pat",
          email: "pat@example.com",
          userId: "u1",
          packed: false,
        },
      ],
    },
  ],
};

describe("PublicPackingPage", () => {
  beforeEach(() => {
    vi.mocked(getPackingListByRoomId).mockReset();
    vi.mocked(currentUser).mockReset();
    vi.mocked(getOrCreateUser).mockReset();
    vi.mocked(getEventForUser).mockReset();
    vi.mocked(canManageEvent).mockReturnValue(false);
    vi.mocked(currentUser).mockResolvedValue(null);
    capturePackingProps.mockClear();
  });

  it("calls notFound when the room id is unknown", async () => {
    vi.mocked(getPackingListByRoomId).mockResolvedValue(null);
    await expect(
      PublicPackingPage({ params: { roomId: "bad" } }),
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders PackingCollabPage when the list exists", async () => {
    vi.mocked(getPackingListByRoomId).mockResolvedValue(
      mockList as Awaited<ReturnType<typeof getPackingListByRoomId>>,
    );
    vi.mocked(currentUser).mockResolvedValue(null);
    const ui = await PublicPackingPage({ params: { roomId: "room-xyz" } });
    render(ui);
    expect(screen.getByTestId("packing-collab")).toBeInTheDocument();
    expect(screen.getByText(/Shared packing list/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in/i })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("passes auth user into PackingCollabPage when signed in", async () => {
    vi.mocked(getPackingListByRoomId).mockResolvedValue(
      mockList as Awaited<ReturnType<typeof getPackingListByRoomId>>,
    );
    vi.mocked(currentUser).mockResolvedValue({ id: "c1" } as Awaited<
      ReturnType<typeof currentUser>
    >);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "u1",
      name: "Sam",
      email: "sam@example.com",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);
    vi.mocked(getEventForUser).mockResolvedValue({
      event: { id: "e1" },
      role: "member",
    } as Awaited<ReturnType<typeof getEventForUser>>);
    const ui = await PublicPackingPage({ params: { roomId: "room-xyz" } });
    render(ui);
    expect(capturePackingProps).toHaveBeenCalled();
    const props = capturePackingProps.mock.calls[0][0];
    expect(props.authUser).toEqual({
      dbUserId: "u1",
      name: "Sam",
      email: "sam@example.com",
    });
  });
});
