import { currentUser } from "@clerk/nextjs/server";
import { Liveblocks } from "@liveblocks/node";
import { NextRequest, NextResponse } from "next/server";
import { getPackingListByRoomId } from "@/lib/packing-list";
import { getOrCreateUser } from "@/lib/user";

type AuthBody = {
  room?: string;
  guestSessionId?: string;
  guestDisplayName?: string;
};

function getLiveblocksSecret(): string | undefined {
  const raw =
    process.env.LIVEBLOCKS_SECRET_KEY?.trim() ||
    process.env.LIVEBLOCKS_SECRET?.trim();
  return raw || undefined;
}

export async function POST(request: NextRequest) {
  try {
    const secret = getLiveblocksSecret();
    if (!secret || !secret.startsWith("sk_")) {
      return NextResponse.json(
        {
          error: "forbidden",
          reason:
            "Liveblocks secret key missing or invalid. Add LIVEBLOCKS_SECRET_KEY to .env.local (the Secret key starting with sk_ from https://liveblocks.io/dashboard/apikeys — not the Public key pk_).",
        },
        { status: 403 },
      );
    }

    let body: AuthBody;
    try {
      body = (await request.json()) as AuthBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const room = body.room;
    if (!room || typeof room !== "string") {
      return NextResponse.json({ error: "Missing room" }, { status: 400 });
    }

    const list = await getPackingListByRoomId(room);
    if (!list) {
      return NextResponse.json(
        { error: "forbidden", reason: "Unknown packing list" },
        { status: 403 },
      );
    }

    let liveblocks: Liveblocks;
    try {
      liveblocks = new Liveblocks({ secret });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Invalid Liveblocks secret key format";
      console.error("[liveblocks-auth] Liveblocks client init failed:", message);
      return NextResponse.json(
        {
          error: "forbidden",
          reason: message,
        },
        { status: 403 },
      );
    }

    const clerkUser = await currentUser();
    if (clerkUser) {
      let dbUser;
      try {
        dbUser = await getOrCreateUser();
      } catch {
        return NextResponse.json(
          { error: "forbidden", reason: "Could not load user" },
          { status: 403 },
        );
      }
      const displayName =
        dbUser.name ||
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        dbUser.email;
      const session = liveblocks.prepareSession(`user:${dbUser.id}`, {
        userInfo: { name: displayName },
      });
      session.allow(room, session.FULL_ACCESS);
      const { status, body: responseBody } = await session.authorize();
      return new NextResponse(responseBody, { status });
    }

    const guestSessionId =
      typeof body.guestSessionId === "string" && body.guestSessionId.length >= 8
        ? body.guestSessionId.slice(0, 128)
        : null;
    if (!guestSessionId) {
      return NextResponse.json(
        { error: "forbidden", reason: "Missing guest session" },
        { status: 403 },
      );
    }

    const guestDisplayName =
      typeof body.guestDisplayName === "string" && body.guestDisplayName.trim()
        ? body.guestDisplayName.trim().slice(0, 120)
        : "Guest";

    const session = liveblocks.prepareSession(`guest:${guestSessionId}`, {
      userInfo: { name: guestDisplayName },
    });
    session.allow(room, session.FULL_ACCESS);
    const { status, body: responseBody } = await session.authorize();
    return new NextResponse(responseBody, { status });
  } catch (e) {
    console.error("[liveblocks-auth] Unexpected error:", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json(
      { error: "forbidden", reason: message },
      { status: 403 },
    );
  }
}

export const dynamic = "force-dynamic";
