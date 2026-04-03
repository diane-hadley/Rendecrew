"use client";

import "@/liveblocks.config";
import {
  LiveblocksProvider,
  RoomProvider,
  useErrorListener,
} from "@liveblocks/react";
import { useEffect, useState } from "react";
import { PackingListEditor, buildInitialStorage } from "./PackingListEditor";
import type { PackingItemPayload } from "@/lib/packing-list";

type AuthUser = { dbUserId: string; name: string; email: string };

/** Shape Liveblocks expects from `authEndpoint` (success or structured failure). */
type LiveblocksAuthResponse =
  | { token: string }
  | { error: "forbidden"; reason: string }
  | { error: string; reason: string };

function useGuestSessionId(roomId: string): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const key = `rendecrew-packing-session-${roomId}`;
    let v = localStorage.getItem(key);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(key, v);
    }
    setId(v);
  }, [roomId]);
  return id;
}

function LiveblocksConnectionMessages() {
  const [lastError, setLastError] = useState<string | null>(null);
  useErrorListener((err) => {
    setLastError(err.message);
  });
  if (!lastError) return null;
  return (
    <div
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
      role="alert"
    >
      {lastError}
    </div>
  );
}

export function PackingCollabPage({
  roomId,
  eventTitle,
  initialItems,
  authUser,
}: {
  roomId: string;
  eventTitle: string;
  initialItems: PackingItemPayload[];
  authUser: AuthUser | null;
}) {
  const [guestDisplayName, setGuestDisplayName] = useState("");
  const [guestStarted, setGuestStarted] = useState(false);
  const guestSessionId = useGuestSessionId(roomId);

  if (!authUser && !guestStarted) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-2 text-lg font-semibold">Join the packing list</h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Choose a display name others will see when you sign up for items.
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (guestDisplayName.trim()) setGuestStarted(true);
          }}
        >
          <input
            type="text"
            required
            maxLength={120}
            value={guestDisplayName}
            onChange={(e) => setGuestDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  if (!authUser && (!guestSessionId || !guestDisplayName.trim())) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">Preparing…</p>
    );
  }

  const resolvedGuestName = guestDisplayName.trim() || null;

  return (
    <LiveblocksProvider
      authEndpoint={async (roomArg) => {
        const res = await fetch("/api/liveblocks-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room: roomArg,
            guestSessionId: authUser ? undefined : guestSessionId,
            guestDisplayName: authUser ? undefined : resolvedGuestName,
          }),
        });
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          throw new Error(
            `Could not reach Liveblocks auth (HTTP ${res.status}). Is the dev server running?`,
          );
        }
        const payload = data as { error?: string; reason?: string };
        if (
          payload &&
          typeof payload === "object" &&
          payload.error === "forbidden" &&
          typeof payload.reason === "string"
        ) {
          throw new Error(payload.reason);
        }
        if (!res.ok) {
          const reason =
            typeof payload.reason === "string"
              ? payload.reason
              : `Liveblocks auth failed (HTTP ${res.status})`;
          throw new Error(reason);
        }
        return data as LiveblocksAuthResponse;
      }}
    >
      <RoomProvider
        id={roomId}
        initialPresence={{}}
        initialStorage={() => buildInitialStorage(initialItems)}
      >
        <LiveblocksConnectionMessages />
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Packing list
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {eventTitle}
            </p>
            {authUser && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                Signed in — sign-ups are tied to your Rendecrew account.
              </p>
            )}
          </div>
          <PackingListEditor
            roomId={roomId}
            authUser={authUser}
            guestDisplayName={authUser ? null : resolvedGuestName}
          />
        </div>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
