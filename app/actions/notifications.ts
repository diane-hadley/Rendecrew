"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { isNotificationKind } from "@/lib/notification-kinds";
import { prisma } from "@/lib/prisma";
import { getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";

export async function getUserNotificationPreferences(): Promise<{
  disabledKinds: string[];
}> {
  const user = await getOrCreateUser();
  const row = await prisma.userNotificationPreferences.findUnique({
    where: { userId: user.id },
    select: { disabledKinds: true },
  });
  return { disabledKinds: row?.disabledKinds ?? [] };
}

export async function saveUserNotificationPreferences(
  disabledKinds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOrCreateUser();
  const filtered = [...new Set(disabledKinds.filter(isNotificationKind))];
  await prisma.userNotificationPreferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, disabledKinds: filtered },
    update: { disabledKinds: filtered },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getEventNotificationOverrides(
  eventId: string,
): Promise<
  | { ok: true; overrides: Record<string, boolean> }
  | { ok: false; error: string }
> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false, error: "Event not found" };

  const em = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
    select: {
      notificationPreferences: { select: { perKindOverrides: true } },
    },
  });
  const raw = em?.notificationPreferences?.perKindOverrides;
  const overrides: Record<string, boolean> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (isNotificationKind(k) && typeof v === "boolean") overrides[k] = v;
    }
  }
  return { ok: true, overrides };
}

export async function saveEventNotificationOverrides(
  eventId: string,
  overrides: Record<string, boolean>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false, error: "Event not found" };

  const em = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
    select: { id: true },
  });
  if (!em) return { ok: false, error: "You are not a member of this event" };

  const cleaned: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (!isNotificationKind(k) || typeof v !== "boolean") continue;
    cleaned[k] = v;
  }

  if (Object.keys(cleaned).length === 0) {
    await prisma.eventMemberNotificationPreferences.deleteMany({
      where: { eventMemberId: em.id },
    });
  } else {
    await prisma.eventMemberNotificationPreferences.upsert({
      where: { eventMemberId: em.id },
      create: {
        eventMemberId: em.id,
        perKindOverrides: cleaned as Prisma.InputJsonValue,
      },
      update: { perKindOverrides: cleaned as Prisma.InputJsonValue },
    });
  }
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}
