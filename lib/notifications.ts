import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  allowsPerEventNotificationOverride,
  isNotificationKind,
  type NotificationKind,
} from "@/lib/notification-kinds";

const RETENTION_DAYS = 30;

export type NotificationMetadata = {
  eventId?: string;
  eventTitle?: string | null;
  taskId?: string;
  taskTitle?: string | null;
  rideCarId?: string;
  packingListId?: string;
  packingItemId?: string;
  packingItemName?: string | null;
  actorName?: string | null;
  /** Extra template fields without secrets */
  [key: string]: unknown;
};

function parseOverrides(
  raw: unknown,
): Partial<Record<NotificationKind, boolean>> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<NotificationKind, boolean>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isNotificationKind(k)) continue;
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * Effective preference: event override if set, else global (disabledKinds = off).
 * If the user is not an event member, notifications for that event are not sent.
 */
export async function isNotificationEnabledForUserEvent(params: {
  recipientUserId: string;
  eventId: string;
  kind: NotificationKind;
}): Promise<boolean> {
  const membership = await prisma.eventMember.findUnique({
    where: {
      eventId_userId: {
        eventId: params.eventId,
        userId: params.recipientUserId,
      },
    },
    select: { id: true },
  });
  if (!membership) return false;

  const [userPrefs, memberPrefs] = await Promise.all([
    prisma.userNotificationPreferences.findUnique({
      where: { userId: params.recipientUserId },
      select: { disabledKinds: true },
    }),
    prisma.eventMemberNotificationPreferences.findUnique({
      where: { eventMemberId: membership.id },
      select: { perKindOverrides: true },
    }),
  ]);

  const disabled = new Set(userPrefs?.disabledKinds ?? []);
  const globalOn = !disabled.has(params.kind);

  const overrides = parseOverrides(memberPrefs?.perKindOverrides);
  if (
    allowsPerEventNotificationOverride(params.kind) &&
    Object.prototype.hasOwnProperty.call(overrides, params.kind)
  ) {
    return Boolean(overrides[params.kind]);
  }
  return globalOn;
}

export type EnqueueNotificationInput = {
  recipientUserId: string;
  actorUserId: string | null;
  kind: NotificationKind;
  metadata?: NotificationMetadata;
  dedupeKey?: string | null;
  /** When set, preference is evaluated for this event; omit only for non-event kinds (none in v1). */
  eventId: string;
};

export async function enqueueNotification(
  input: EnqueueNotificationInput,
): Promise<void> {
  if (
    input.actorUserId != null &&
    input.actorUserId === input.recipientUserId
  ) {
    return;
  }

  const enabled = await isNotificationEnabledForUserEvent({
    recipientUserId: input.recipientUserId,
    eventId: input.eventId,
    kind: input.kind,
  });
  if (!enabled) return;

  const metadata = (input.metadata ?? {}) as Prisma.InputJsonValue;

  try {
    await prisma.notification.create({
      data: {
        recipientUserId: input.recipientUserId,
        actorUserId: input.actorUserId,
        kind: input.kind,
        metadata,
        dedupeKey: input.dedupeKey?.trim() || null,
      },
    });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (code === "P2002") {
      return;
    }
    throw e;
  }
}

export async function enqueueManyNotifications(
  items: EnqueueNotificationInput[],
): Promise<void> {
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop -- small batches; keeps ordering simple
    await enqueueNotification(item);
  }
}

/**
 * Inserts a row without re-checking preferences or membership.
 * Use only when preferences were evaluated while the recipient was still an event member
 * (e.g. event deleted).
 */
export async function insertNotificationIgnoringPreferences(params: {
  recipientUserId: string;
  actorUserId: string | null;
  kind: NotificationKind;
  metadata?: NotificationMetadata;
  dedupeKey?: string | null;
}): Promise<void> {
  if (
    params.actorUserId != null &&
    params.actorUserId === params.recipientUserId
  ) {
    return;
  }
  const metadata = (params.metadata ?? {}) as Prisma.InputJsonValue;
  try {
    await prisma.notification.create({
      data: {
        recipientUserId: params.recipientUserId,
        actorUserId: params.actorUserId,
        kind: params.kind,
        metadata,
        dedupeKey: params.dedupeKey?.trim() || null,
      },
    });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (code === "P2002") return;
    throw e;
  }
}

export async function markAllNotificationsReadForUser(
  userId: string,
): Promise<{ count: number }> {
  const res = await prisma.notification.updateMany({
    where: { recipientUserId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { count: res.count };
}

export async function countUnreadNotifications(
  userId: string,
): Promise<number> {
  return prisma.notification.count({
    where: { recipientUserId: userId, readAt: null },
  });
}

export type NotificationListRow = {
  id: string;
  /** DB string; may be a legacy/unknown kind — UI should tolerate via `labelForKind`-style lookup. */
  kind: string;
  createdAt: string;
  readAt: string | null;
  metadata: NotificationMetadata;
  actorUserId: string | null;
};

export async function listNotificationsForUser(params: {
  userId: string;
  take: number;
  cursor?: { createdAt: string; id: string } | null;
}): Promise<{
  items: NotificationListRow[];
  nextCursor: { createdAt: string; id: string } | null;
}> {
  const take = Math.min(Math.max(params.take, 1), 50);
  const cur = params.cursor
    ? {
        createdAt: new Date(params.cursor.createdAt),
        id: params.cursor.id,
      }
    : null;

  const rows = await prisma.notification.findMany({
    where: {
      recipientUserId: params.userId,
      ...(cur
        ? {
            OR: [
              { createdAt: { lt: cur.createdAt } },
              { AND: [{ createdAt: cur.createdAt }, { id: { lt: cur.id } }] },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: {
      id: true,
      kind: true,
      createdAt: true,
      readAt: true,
      metadata: true,
      actorUserId: true,
    },
  });

  const page = rows.slice(0, take);
  const hasMore = rows.length > take;
  const last = page[page.length - 1];

  const items: NotificationListRow[] = page.map((r) => ({
    id: r.id,
    kind: r.kind,
    createdAt: r.createdAt.toISOString(),
    readAt: r.readAt ? r.readAt.toISOString() : null,
    metadata: (r.metadata ?? {}) as NotificationMetadata,
    actorUserId: r.actorUserId,
  }));

  return {
    items,
    nextCursor:
      hasMore && last
        ? { createdAt: last.createdAt.toISOString(), id: last.id }
        : null,
  };
}

export async function purgeNotificationsOlderThanRetention(): Promise<{
  deleted: number;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const res = await prisma.notification.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { deleted: res.count };
}
