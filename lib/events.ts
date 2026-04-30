import {
  EventMemberRole,
  type MemberManagementPolicy,
  type PackingListVisibility,
} from "@prisma/client";
import { prisma } from "./prisma";
import { APP_DEFAULT_TIME_ZONE } from "./event-datetime";

export type DashboardEventRow = {
  event: {
    id: string;
    title: string;
    generalInformation: string | null;
    startAt: Date | null;
    startAtTimeZone: string;
    endAt: Date | null;
    endAtTimeZone: string;
    location: string | null;
    createdById: string;
    suggestionApprovalRequired: boolean;
    memberManagementPolicy: MemberManagementPolicy;
    packingListVisibility: PackingListVisibility;
    packingEnabled: boolean;
    ridesEnabled: boolean;
    taskBoardEnabled: boolean;
    rides_mode: import("@prisma/client").RidesMode;
    rides_hidden_built_in_field_keys: string[];
    createdAt: Date;
    updatedAt: Date;
  };
  /** Effective membership role for the current user. */
  role: EventMemberRole;
};

export {
  normalizeEventRole,
  isEventAdmin,
  canManageEvent,
  isEventCreator,
  canDeleteEvent,
  formatEventRoleLabel,
} from "./event-role-utils";

/**
 * Events the user is part of as a member, or created (creator), deduplicated.
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
      membership?.role ??
      (event.createdById === userId
        ? EventMemberRole.creator
        : EventMemberRole.member);
    const { eventMembers: _eventMembers, ...eventRow } = event;
    void _eventMembers;
    const startAtTimeZone =
      (
        (event as unknown as { startAtTimeZone?: string }).startAtTimeZone ??
        APP_DEFAULT_TIME_ZONE
      ).trim() || APP_DEFAULT_TIME_ZONE;
    const endAtTimeZone =
      (
        (event as unknown as { endAtTimeZone?: string }).endAtTimeZone ??
        startAtTimeZone
      ).trim() || startAtTimeZone;
    return { event: { ...eventRow, startAtTimeZone, endAtTimeZone }, role };
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
    membership?.role ??
    (event.createdById === userId
      ? EventMemberRole.creator
      : EventMemberRole.member);
  const { eventMembers: _eventMembers, ...eventRow } = event;
  void _eventMembers;
  const startAtTimeZone =
    (
      (event as unknown as { startAtTimeZone?: string }).startAtTimeZone ??
      APP_DEFAULT_TIME_ZONE
    ).trim() || APP_DEFAULT_TIME_ZONE;
  const endAtTimeZone =
    (
      (event as unknown as { endAtTimeZone?: string }).endAtTimeZone ??
      startAtTimeZone
    ).trim() || startAtTimeZone;
  return { event: { ...eventRow, startAtTimeZone, endAtTimeZone }, role };
}
