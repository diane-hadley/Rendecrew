"use server";

import { revalidatePath } from "next/cache";
import {
  createPackingListForEvent,
  getPackingListByRoomId,
  persistPackingListItems,
  type PackingItemPayload,
} from "@/lib/packing-list";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

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

/**
 * Public sync: anyone who knows the unguessable room id can persist (same trust model as the share link).
 */
export async function syncPackingListToDatabase(
  liveblocksRoomId: string,
  items: PackingItemPayload[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = await getPackingListByRoomId(liveblocksRoomId);
  if (!list) {
    return { ok: false, error: "Invalid packing list" };
  }
  const result = await persistPackingListItems(liveblocksRoomId, items);
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
