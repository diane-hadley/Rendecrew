"use server";

import { revalidatePath } from "next/cache";
import {
  createPackingListForEvent,
  getPackingListByRoomId,
  persistPackingListItems,
  type PackingItemPayload,
} from "@/lib/packing-list";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";

export async function enablePackingListForEvent(
  eventId: string,
): Promise<{ ok: true; liveblocksRoomId: string } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const row = await getEventForUser(eventId, user.id);
    if (!row || !canManageEvent(row.role)) {
      return { ok: false, error: "You do not have permission to enable a packing list" };
    }
    const list = await createPackingListForEvent(eventId);
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { ok: true, liveblocksRoomId: list.liveblocksRoomId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to enable packing list";
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
