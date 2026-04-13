"use server";

import { PackingListVisibility } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  createPackingListForEvent,
  getPackingListByRoomId,
  persistPackingListItems,
  type PackingListSyncPayload,
  type PackingPersistActor,
} from "@/lib/packing-list";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { getOptionalDbUser, getOrCreateUser } from "@/lib/user";

export async function enablePackingListForEvent(
  eventId: string,
): Promise<
  { ok: true; liveblocksRoomId: string } | { ok: false; error: string }
> {
  try {
    const user = await getOrCreateUser();
    const row = await getEventForUser(eventId, user.id);
    if (!row || !canManageEvent(row.role)) {
      return {
        ok: false,
        error: "You do not have permission to enable a packing list",
      };
    }
    const list = await createPackingListForEvent(eventId);
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { ok: true, liveblocksRoomId: list.liveblocksRoomId };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to enable packing list";
    return { ok: false, error: message };
  }
}

export type SyncPackingListContext = {
  /** Required for guest sync so the server can merge only that guest’s sign-ups. */
  guestDisplayName?: string | null;
};

/**
 * Public sync: share URL participants can persist when the list is URL-public;
 * members-only lists require a signed-in event member.
 */
export async function syncPackingListToDatabase(
  liveblocksRoomId: string,
  payload: PackingListSyncPayload,
  context: SyncPackingListContext = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = await getPackingListByRoomId(liveblocksRoomId);
  if (!list) {
    return { ok: false, error: "Invalid packing list" };
  }

  let actor: PackingPersistActor;

  if (list.event.packingListVisibility === PackingListVisibility.MEMBERS_ONLY) {
    const dbUser = await getOptionalDbUser();
    if (!dbUser) {
      return {
        ok: false,
        error: "Sign in to sync this members-only packing list.",
      };
    }
    const row = await getEventForUser(list.event.id, dbUser.id);
    if (!row) {
      return {
        ok: false,
        error: "You are not a member of this event.",
      };
    }
    const isOrg = canManageEvent(row.role);
    actor = isOrg
      ? { kind: "organizer", userId: dbUser.id }
      : { kind: "participant", userId: dbUser.id };
  } else {
    const dbUser = await getOptionalDbUser();
    if (dbUser) {
      const row = await getEventForUser(list.event.id, dbUser.id);
      const isOrg = row != null && canManageEvent(row.role);
      actor = isOrg
        ? { kind: "organizer", userId: dbUser.id }
        : { kind: "participant", userId: dbUser.id };
    } else {
      const gn = context.guestDisplayName?.trim();
      if (!gn) {
        return {
          ok: false,
          error:
            "Use your display name as a guest, or sign in, so sign-ups can sync to the event.",
        };
      }
      actor = { kind: "guest", displayName: gn };
    }
  }

  const result = await persistPackingListItems(
    liveblocksRoomId,
    payload,
    actor,
  );
  if (!result.ok) {
    return result;
  }
  revalidatePath(`/dashboard/events/${list.eventId}`);
  revalidatePath(`/packing/${liveblocksRoomId}`);
  return { ok: true };
}

/** Mark your own sign-up as packed (event dashboard only; merged on shared-list sync). */
export async function setMyPackingSignUpPacked(
  eventId: string,
  signUpId: string,
  packed: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const row = await getEventForUser(eventId, user.id);
    if (!row) {
      return { ok: false, error: "Event not found" };
    }
    const list = await prisma.packingList.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (!list) {
      return { ok: false, error: "No packing list for this event" };
    }
    const existing = await prisma.packingItemSignUp.findFirst({
      where: {
        id: signUpId,
        userId: user.id,
        packingItem: { packingListId: list.id },
      },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, error: "Sign-up not found" };
    }
    await prisma.packingItemSignUp.update({
      where: { id: signUpId },
      data: { packed },
    });
    revalidatePath(`/dashboard/events/${eventId}`);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not update packed status";
    return { ok: false, error: message };
  }
}
