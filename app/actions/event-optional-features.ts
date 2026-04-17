"use server";

import { revalidatePath } from "next/cache";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

export type OptionalFeatureResult = { ok: true } | { ok: false; error: string };

export async function enableEventRidesFeature(
  eventId: string,
): Promise<OptionalFeatureResult> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row || !canManageEvent(row.role)) {
    return {
      ok: false,
      error: "You do not have permission to change this event",
    };
  }

  try {
    await prisma.event.update({
      where: { id: eventId },
      data: { ridesEnabled: true },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to enable rides";
    return { ok: false, error: message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

export async function disableEventPackingFeature(
  eventId: string,
): Promise<OptionalFeatureResult> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row || !canManageEvent(row.role)) {
    return {
      ok: false,
      error: "You do not have permission to change this event",
    };
  }

  const list = await prisma.packingList.findUnique({
    where: { eventId },
    select: { liveblocksRoomId: true },
  });

  try {
    await prisma.$transaction([
      prisma.personalPackingItem.deleteMany({ where: { eventId } }),
      prisma.packingSuggestion.deleteMany({ where: { eventId } }),
      prisma.userSuggestionState.deleteMany({ where: { eventId } }),
      prisma.packingList.deleteMany({ where: { eventId } }),
      prisma.event.update({
        where: { id: eventId },
        data: { packingEnabled: false },
      }),
    ]);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to disable packing list";
    return { ok: false, error: message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${eventId}`);
  if (list?.liveblocksRoomId) {
    revalidatePath(`/packing/${list.liveblocksRoomId}`);
  }
  return { ok: true };
}

export async function disableEventRidesFeature(
  eventId: string,
): Promise<OptionalFeatureResult> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row || !canManageEvent(row.role)) {
    return {
      ok: false,
      error: "You do not have permission to change this event",
    };
  }

  try {
    await prisma.$transaction([
      prisma.eventRideCar.deleteMany({ where: { eventId } }),
      prisma.event_ride_custom_field_definitions.deleteMany({
        where: { event_id: eventId },
      }),
      prisma.event.update({
        where: { id: eventId },
        data: { ridesEnabled: false },
      }),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to disable rides";
    return { ok: false, error: message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}
