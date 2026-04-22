"use server";

import { prisma } from "@/lib/prisma";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";
import { revalidatePath } from "next/cache";

export type UpdateEventGeneralInformationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateEventGeneralInformation(params: {
  eventId: string;
  generalInformation: string | null;
}): Promise<UpdateEventGeneralInformationResult> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(params.eventId, user.id);
  if (!row || !canManageEvent(row.role)) {
    return {
      ok: false,
      error: "You do not have permission to edit this event",
    };
  }

  try {
    await prisma.event.update({
      where: { id: params.eventId },
      data: {
        generalInformation: params.generalInformation?.trim() || null,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to update event information";
    return { ok: false, error: message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${params.eventId}`);
  return { ok: true };
}
