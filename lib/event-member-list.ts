import type { EventMemberListItem } from "@/lib/event-member-types";
import { prisma } from "@/lib/prisma";

export async function listEventMemberListItemsForEvent(
  eventId: string,
): Promise<EventMemberListItem[]> {
  const members = await prisma.eventMember.findMany({
    where: { eventId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
  }));
}
