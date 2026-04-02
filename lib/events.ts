import { prisma } from "./prisma";

export type DashboardEventRow = {
  event: {
    id: string;
    title: string;
    description: string | null;
    startAt: Date | null;
    endAt: Date | null;
    location: string | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  };
  /** Membership role, or "owner" when the user is creator but has no membership row. */
  role: string;
};

/**
 * Events the user is part of as a member, or created (owner), deduplicated.
 */
export async function getEventsForUser(
  userId: string,
): Promise<DashboardEventRow[]> {
  const events = await prisma.event.findMany({
    where: {
      OR: [{ eventMembers: { some: { userId } } }, { createdById: userId }],
    },
    include: {
      eventMembers: {
        where: { userId },
        take: 1,
      },
    },
    orderBy: { startAt: "asc" },
  });

  return events.map((event) => {
    const membership = event.eventMembers[0];
    const role =
      membership?.role ?? (event.createdById === userId ? "owner" : "member");
    const { eventMembers, ...eventRow } = event;
    void eventMembers;
    return { event: eventRow, role };
  });
}

/**
 * Single event if the user is a member or the creator. Returns null if missing or no access.
 */
export async function getEventForUser(
  eventId: string,
  userId: string,
): Promise<DashboardEventRow | null> {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      OR: [{ eventMembers: { some: { userId } } }, { createdById: userId }],
    },
    include: {
      eventMembers: {
        where: { userId },
        take: 1,
      },
    },
  });

  if (!event) return null;

  const membership = event.eventMembers[0];
  const role =
    membership?.role ?? (event.createdById === userId ? "owner" : "member");
  const { eventMembers, ...eventRow } = event;
  void eventMembers;
  return { event: eventRow, role };
}

export function canManageEvent(role: string): boolean {
  return role === "owner" || role === "admin";
}
