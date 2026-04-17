"use server";

import type {
  MemberManagementPolicy,
  PackingListVisibility,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

export type UpdateEventSettingsInput = {
  eventId: string;
  memberManagementPolicy: MemberManagementPolicy;
  packingListVisibility: PackingListVisibility;
  suggestionApprovalRequired: boolean;
};

export type UpdateEventSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateEventSettings(
  input: UpdateEventSettingsInput,
): Promise<UpdateEventSettingsResult> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(input.eventId, user.id);
  if (!row || !canManageEvent(row.role)) {
    return {
      ok: false,
      error: "You do not have permission to change event settings",
    };
  }

  try {
    await prisma.event.update({
      where: { id: input.eventId },
      data: {
        memberManagementPolicy: input.memberManagementPolicy,
        packingListVisibility: input.packingListVisibility,
        suggestionApprovalRequired: input.suggestionApprovalRequired,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to update settings";
    return { ok: false, error: message };
  }

  const list = await prisma.packingList.findUnique({
    where: { eventId: input.eventId },
    select: { liveblocksRoomId: true },
  });
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${input.eventId}`);
  if (list?.liveblocksRoomId) {
    revalidatePath(`/packing/${list.liveblocksRoomId}`);
  }
  return { ok: true };
}
