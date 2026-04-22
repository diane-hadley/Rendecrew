import { EventMemberRole } from "@prisma/client";

/**
 * Pure role helpers — safe to import from Client Components (no Prisma / Node `pg`).
 * Server code may import from `@/lib/events` instead, which re-exports these.
 */

/** Normalize legacy `"owner"` and unknown strings for permission checks. */
export function normalizeEventRole(
  role: string | EventMemberRole | null | undefined,
): EventMemberRole {
  const s = role == null ? "" : String(role);
  if (
    s === "owner" ||
    s === "organizer" ||
    s === EventMemberRole.creator ||
    s === "creator"
  ) {
    return EventMemberRole.creator;
  }
  if (s === EventMemberRole.admin || s === "admin") {
    return EventMemberRole.admin;
  }
  return EventMemberRole.member;
}

export function isEventAdmin(role: string | EventMemberRole): boolean {
  const r = normalizeEventRole(role);
  return r === EventMemberRole.creator || r === EventMemberRole.admin;
}

export function canManageEvent(role: string | EventMemberRole): boolean {
  return isEventAdmin(role);
}

export function isEventCreator(
  userId: string,
  event: { createdById: string },
): boolean {
  return event.createdById === userId;
}

/** Only the event creator may delete; `Event.createdById` is authoritative (see spec §4.1). */
export function canDeleteEvent(
  userId: string,
  event: { createdById: string },
): boolean {
  return isEventCreator(userId, event);
}

export function formatEventRoleLabel(role: string | EventMemberRole): string {
  const r = normalizeEventRole(role);
  if (r === EventMemberRole.creator) return "Creator";
  if (r === EventMemberRole.admin) return "Admin";
  return "Member";
}
