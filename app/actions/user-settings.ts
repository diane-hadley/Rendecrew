"use server";

import { revalidatePath } from "next/cache";
import { isValidIanaTimeZone } from "@/lib/event-datetime";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

export type UpdateUserTimezoneResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateUserTimezone(
  timezone: string,
): Promise<UpdateUserTimezoneResult> {
  const trimmed = timezone.trim();
  if (!trimmed || !isValidIanaTimeZone(trimmed)) {
    return { ok: false, error: "Choose a valid timezone" };
  }
  const user = await getOrCreateUser();
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { timezone: trimmed },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not update timezone";
    return { ok: false, error: message };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/events/new");
  return { ok: true };
}
