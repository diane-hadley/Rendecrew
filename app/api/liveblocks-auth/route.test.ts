/**
 * @vitest-environment node
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const liveblocksMocks = vi.hoisted(() => {
  const state = { constructError: null as Error | null };
  const allow = vi.fn();
  const authorize = vi
    .fn()
    .mockResolvedValue({ status: 200, body: "auth-body" });
  const prepareSession = vi.fn(() => ({
    allow,
    authorize,
    FULL_ACCESS: "full",
  }));
  class Liveblocks {
    constructor(_opts: { secret: string }) {
      void _opts;
      if (state.constructError) throw state.constructError;
    }
    prepareSession(...args: unknown[]) {
      return prepareSession(...args);
    }
  }
  return { Liveblocks, prepareSession, allow, authorize, state };
});

vi.mock("@liveblocks/node", () => ({
  Liveblocks: liveblocksMocks.Liveblocks,
}));

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(),
}));

vi.mock("@/lib/packing-list", () => ({
  getPackingListByRoomId: vi.fn(),
}));

vi.mock("@/lib/events", () => ({
  getEventForUser: vi.fn(),
}));

vi.mock("@/lib/user", () => ({
  getOrCreateUser: vi.fn(),
}));

import { PackingListVisibility } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import { getEventForUser } from "@/lib/events";
import { getPackingListByRoomId } from "@/lib/packing-list";
import { getOrCreateUser } from "@/lib/user";

describe("POST /api/liveblocks-auth", () => {
  const prevSecret = process.env.LIVEBLOCKS_SECRET_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    liveblocksMocks.state.constructError = null;
    process.env.LIVEBLOCKS_SECRET_KEY = "sk_test_secret_key";
    vi.mocked(getEventForUser).mockReset();
    vi.mocked(getPackingListByRoomId).mockResolvedValue({
      id: "pl",
      liveblocksRoomId: "room-abc",
      eventId: "e1",
      event: {
        id: "e1",
        packingListVisibility: PackingListVisibility.URL_PUBLIC,
      },
    } as Awaited<ReturnType<typeof getPackingListByRoomId>>);
    liveblocksMocks.authorize.mockResolvedValue({
      status: 200,
      body: "auth-body",
    });
  });

  afterEach(() => {
    if (prevSecret === undefined) {
      delete process.env.LIVEBLOCKS_SECRET_KEY;
    } else {
      process.env.LIVEBLOCKS_SECRET_KEY = prevSecret;
    }
  });

  function req(body: unknown) {
    return new NextRequest("http://localhost/api/liveblocks-auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 403 when secret is missing", async () => {
    delete process.env.LIVEBLOCKS_SECRET_KEY;
    const res = await POST(req({ room: "room-abc" }));
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error).toBe("forbidden");
  });

  it("returns 403 when secret does not start with sk_", async () => {
    process.env.LIVEBLOCKS_SECRET_KEY = "pk_wrong";
    const res = await POST(req({ room: "room-abc" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON", async () => {
    const bad = new NextRequest("http://localhost/api/liveblocks-auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("returns 400 when room is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns 403 for unknown packing list", async () => {
    vi.mocked(getPackingListByRoomId).mockResolvedValueOnce(null);
    const res = await POST(req({ room: "missing" }));
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.reason).toMatch(/Unknown packing list/);
  });

  it("returns 403 when Liveblocks client init fails", async () => {
    liveblocksMocks.state.constructError = new Error("bad secret format");
    const res = await POST(req({ room: "room-abc" }));
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.reason).toBe("bad secret format");
  });

  it("authorizes signed-in users with DB display name", async () => {
    vi.mocked(currentUser).mockResolvedValue({
      id: "clerk-1",
      firstName: "Ada",
      lastName: "Lovelace",
      emailAddresses: [{ emailAddress: "ada@example.com" }],
    } as Awaited<ReturnType<typeof currentUser>>);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "db-u1",
      name: "DB Name",
      email: "ada@example.com",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);

    const res = await POST(req({ room: "room-abc" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("auth-body");
    expect(liveblocksMocks.prepareSession).toHaveBeenCalledWith(
      "user:db-u1",
      expect.objectContaining({
        userInfo: { name: "DB Name" },
      }),
    );
    expect(liveblocksMocks.allow).toHaveBeenCalledWith("room-abc", "full");
  });

  it("returns 403 when getOrCreateUser fails for signed-in user", async () => {
    vi.mocked(currentUser).mockResolvedValue({
      id: "clerk-1",
      firstName: "A",
      lastName: "B",
      emailAddresses: [{ emailAddress: "a@b.c" }],
    } as Awaited<ReturnType<typeof currentUser>>);
    vi.mocked(getOrCreateUser).mockRejectedValueOnce(new Error("db down"));

    const res = await POST(req({ room: "room-abc" }));
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.reason).toBe("Could not load user");
  });

  it("returns 403 for guests when list is members-only", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    vi.mocked(getPackingListByRoomId).mockResolvedValueOnce({
      id: "pl",
      liveblocksRoomId: "room-abc",
      eventId: "e1",
      event: {
        id: "e1",
        packingListVisibility: PackingListVisibility.MEMBERS_ONLY,
      },
    } as Awaited<ReturnType<typeof getPackingListByRoomId>>);
    const res = await POST(
      req({
        room: "room-abc",
        guestSessionId: "12345678",
        guestDisplayName: "Guest",
      }),
    );
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.reason).toMatch(/signed-in event members/i);
  });

  it("returns 403 for signed-in non-member when list is members-only", async () => {
    vi.mocked(currentUser).mockResolvedValue({
      id: "clerk-1",
      firstName: "A",
      lastName: "B",
      emailAddresses: [{ emailAddress: "a@b.c" }],
    } as Awaited<ReturnType<typeof currentUser>>);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      id: "db-u1",
      name: "A B",
      email: "a@b.c",
    } as Awaited<ReturnType<typeof getOrCreateUser>>);
    vi.mocked(getPackingListByRoomId).mockResolvedValueOnce({
      id: "pl",
      liveblocksRoomId: "room-abc",
      eventId: "e1",
      event: {
        id: "e1",
        packingListVisibility: PackingListVisibility.MEMBERS_ONLY,
      },
    } as Awaited<ReturnType<typeof getPackingListByRoomId>>);
    vi.mocked(getEventForUser).mockResolvedValueOnce(null);
    const res = await POST(req({ room: "room-abc" }));
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.reason).toMatch(/event members/i);
  });

  it("returns 403 for guests without a valid session id", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    const res = await POST(
      req({
        room: "room-abc",
        guestSessionId: "short",
        guestDisplayName: "Bob",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("authorizes guests with trimmed display name", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    const res = await POST(
      req({
        room: "room-abc",
        guestSessionId: "12345678",
        guestDisplayName: "  Carol  ",
      }),
    );
    expect(res.status).toBe(200);
    expect(liveblocksMocks.prepareSession).toHaveBeenCalledWith(
      "guest:12345678",
      {
        userInfo: { name: "Carol" },
      },
    );
  });

  it("defaults guest display name when empty", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    await POST(
      req({
        room: "room-abc",
        guestSessionId: "12345678",
        guestDisplayName: "   ",
      }),
    );
    expect(liveblocksMocks.prepareSession).toHaveBeenCalledWith(
      "guest:12345678",
      {
        userInfo: { name: "Guest" },
      },
    );
  });
});
