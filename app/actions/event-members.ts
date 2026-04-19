"use server";

import { EventMemberRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  actorCanAddMembers,
  authorizeDemoteAdmin,
  authorizePromoteToAdmin,
  authorizeRemoveOrLeaveMember,
} from "@/lib/event-member-policy";
import { getEventForUser, normalizeEventRole } from "@/lib/events";
import {
  enqueueNotification,
  insertNotificationIgnoringPreferences,
  isNotificationEnabledForUserEvent,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

export type EventMemberListItem = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: EventMemberRole;
  createdAt: string;
};

export async function listEventMembers(
  eventId: string,
): Promise<
  { ok: true; members: EventMemberListItem[] } | { ok: false; error: string }
> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false, error: "Event not found" };

  const members = await prisma.eventMember.findMany({
    where: { eventId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return {
    ok: true,
    members: members.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function searchUsersToAddToEvent(
  eventId: string,
  query: string,
): Promise<
  | { ok: true; users: Array<{ id: string; name: string; email: string }> }
  | { ok: false; error: string }
> {
  const q = query.trim();
  if (q.length < 2) {
    return { ok: false, error: "Type at least two characters to search." };
  }

  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false, error: "Event not found" };
  if (!actorCanAddMembers(row.role, row.event.memberManagementPolicy)) {
    return { ok: false, error: "You do not have permission to add members." };
  }

  const existing = await prisma.eventMember.findMany({
    where: { eventId },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((e) => e.userId));
  existingIds.add(user.id);
  const excludeIds = [...existingIds];
  const users = await prisma.user.findMany({
    where: {
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 15,
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return { ok: true, users };
}

export async function addEventMember(
  eventId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = targetUserId?.trim();
  if (!trimmed) {
    return { ok: false, error: "Select a user to add." };
  }

  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false, error: "Event not found" };
  if (!actorCanAddMembers(row.role, row.event.memberManagementPolicy)) {
    return { ok: false, error: "You do not have permission to add members." };
  }

  const target = await prisma.user.findUnique({ where: { id: trimmed } });
  if (!target) {
    return { ok: false, error: "That user was not found." };
  }

  const existing = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: trimmed } },
  });
  if (existing) {
    return { ok: false, error: "That user is already a member." };
  }

  let eventTitle: string | null = null;
  try {
    const [, ev] = await Promise.all([
      prisma.eventMember.create({
        data: { eventId, userId: trimmed, role: EventMemberRole.member },
      }),
      prisma.event.findUnique({
        where: { id: eventId },
        select: { title: true },
      }),
    ]);
    eventTitle = ev?.title ?? null;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add member";
    return { ok: false, error: message };
  }

  await enqueueNotification({
    recipientUserId: trimmed,
    actorUserId: user.id,
    kind: "event.member_added",
    eventId,
    metadata: { eventId, eventTitle },
  });

  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

export async function removeEventMember(
  eventId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false, error: "Event not found" };

  const targetMembership = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: targetUserId } },
  });
  if (!targetMembership) {
    return { ok: false, error: "Member not found." };
  }

  const auth = authorizeRemoveOrLeaveMember({
    actorUserId: user.id,
    actorRole: normalizeEventRole(row.role),
    targetUserId,
    targetRole: targetMembership.role,
    eventCreatorId: row.event.createdById,
    policy: row.event.memberManagementPolicy,
  });
  if (!auth.ok) return auth;

  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: { title: true },
  });

  const allowRemovedNotif = await isNotificationEnabledForUserEvent({
    recipientUserId: targetUserId,
    eventId,
    kind: "event.member_removed",
  });

  try {
    await prisma.eventMember.delete({
      where: { eventId_userId: { eventId, userId: targetUserId } },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to remove member";
    return { ok: false, error: message };
  }

  if (allowRemovedNotif) {
    await insertNotificationIgnoringPreferences({
      recipientUserId: targetUserId,
      actorUserId: user.id,
      kind: "event.member_removed",
      metadata: { eventId, eventTitle: ev?.title ?? null },
    });
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

export async function promoteMemberToAdmin(
  eventId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false, error: "Event not found" };

  const targetMembership = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: targetUserId } },
  });
  if (!targetMembership) {
    return { ok: false, error: "Member not found." };
  }

  const auth = authorizePromoteToAdmin(
    normalizeEventRole(row.role),
    targetMembership.role,
  );
  if (!auth.ok) return auth;

  try {
    await prisma.eventMember.update({
      where: { eventId_userId: { eventId, userId: targetUserId } },
      data: { role: EventMemberRole.admin },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to promote member";
    return { ok: false, error: message };
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

export async function demoteAdminToMember(
  eventId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row) return { ok: false, error: "Event not found" };

  const targetMembership = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: targetUserId } },
  });
  if (!targetMembership) {
    return { ok: false, error: "Member not found." };
  }

  const auth = authorizeDemoteAdmin(
    user.id,
    row.event.createdById,
    targetUserId,
    targetMembership.role,
  );
  if (!auth.ok) return auth;

  try {
    await prisma.eventMember.update({
      where: { eventId_userId: { eventId, userId: targetUserId } },
      data: { role: EventMemberRole.member },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to demote admin";
    return { ok: false, error: message };
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}
