import { DateTime } from "luxon";
import { isNotificationKind, NOTIFICATION_KIND_UI } from "./notification-kinds";
import type { NotificationMetadata } from "./notifications";

function whoLabel(
  actorNameFromRow: string | null | undefined,
  metadata: NotificationMetadata,
  actorUserId: string | null,
): string {
  const m = metadata.actorName;
  if (typeof m === "string" && m.trim() !== "") return m.trim();
  const n = actorNameFromRow?.trim();
  if (n) return n;
  if (actorUserId) return "Someone";
  return "Someone";
}

function eventTitleOrFallback(eventTitle: string | null | undefined): string {
  const t = eventTitle?.trim();
  if (t) return t;
  return "this event";
}

/** Which event a rides/tasks/packing notification refers to. */
function inEvent(title: string): string {
  return ` in “${title}”`;
}

function itemTitle(itemName: string | null | undefined): string {
  const t = itemName?.trim();
  if (t) return t;
  return "an item";
}

function taskTitle(m: NotificationMetadata): string {
  const t = m.taskTitle;
  if (typeof t === "string" && t.trim() !== "") return t.trim();
  return "this task";
}

function shortKindLabel(kind: string): string {
  return NOTIFICATION_KIND_UI.find((k) => k.kind === kind)?.label ?? kind;
}

function legPhrase(leg: unknown): string {
  if (leg === "TO_EVENT") return "to the event";
  if (leg === "FROM_EVENT") return "from the event";
  return "on a trip";
}

function formatCalendarDateInZone(
  iso: string | null | undefined,
  timeZone: string,
): string {
  if (iso == null || iso === "") return "no date set";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? DateTime.fromISO(iso, { zone: timeZone })
    : DateTime.fromISO(iso, { zone: "utc" }).setZone(timeZone);
  if (!d.isValid) return String(iso);
  return d.toFormat("MMMM d, yyyy");
}

type FormatInput = {
  kind: string;
  metadata: NotificationMetadata;
  /** From User join when the actor still exists. */
  actorName: string | null;
  actorUserId: string | null;
  /** User's account timezone (IANA) for task due date wording. */
  timeZone: string;
};

/**
 * One-line, user-facing copy for a notification. Uses the actor and metadata
 * produced at enqueue time (or resolved from the actor user row).
 */
export function formatNotificationMessage(i: FormatInput): string {
  const { metadata } = i;
  const w = whoLabel(i.actorName, metadata, i.actorUserId);
  const tz = i.timeZone;
  const et = eventTitleOrFallback(metadata.eventTitle as string | null);

  if (!isNotificationKind(i.kind)) {
    return `${w} — ${shortKindLabel(i.kind)}${inEvent(et)}.`;
  }

  const kind = i.kind;

  switch (kind) {
    case "event.member_added":
      return `${w} added you to “${et}”.`;
    case "event.member_removed":
      return `${w} removed you from “${et}”.`;
    case "packing.signup_or_quantity": {
      const it = itemTitle(
        metadata.packingItemName as string | null | undefined,
      );
      return `${w} updated your packing for “${it}”${inEvent(et)}.`;
    }
    case "packing.removed_from_item": {
      const it = itemTitle(
        metadata.packingItemName as string | null | undefined,
      );
      return `${w} removed you from packing “${it}”${inEvent(et)}.`;
    }
    case "rides.passenger_joined_my_car": {
      const leg = metadata.leg;
      const passengerName =
        typeof metadata.passengerName === "string" &&
        metadata.passengerName.trim() !== ""
          ? metadata.passengerName.trim()
          : "Someone";
      const puid = metadata.passengerUserId as string | undefined;
      const selfJoin = Boolean(puid && i.actorUserId && puid === i.actorUserId);
      if (selfJoin) {
        return `${passengerName} joined your car${inEvent(et)} (${legPhrase(leg)}).`;
      }
      return `${w} added ${passengerName} to your car${inEvent(et)} (${legPhrase(leg)}).`;
    }
    case "rides.driver_assignment_changed": {
      const ch = String(metadata.change ?? "");
      if (ch === "removed")
        return `${w} removed you as a driver${inEvent(et)}.`;
      return `${w} made you a driver${inEvent(et)}.`;
    }
    case "rides.car_assignment_changed": {
      const ch = String(metadata.change ?? "");
      const leg = metadata.leg;
      if (ch === "removed")
        return `${w} removed you from a car (${legPhrase(leg)})${inEvent(et)}.`;
      if (ch === "added")
        return `${w} added you to a car (${legPhrase(leg)})${inEvent(et)}.`;
      return `${w} changed your car assignment (${legPhrase(leg)})${inEvent(et)}.`;
    }
    case "tasks.assignment_changed": {
      const title = taskTitle(metadata);
      const ch = String(metadata.change ?? "");
      if (ch === "task_deleted")
        return `${w} deleted the task “${title}”${inEvent(et)}.`;
      if (ch === "unassigned")
        return `${w} removed you from the task “${title}”${inEvent(et)}.`;
      return `${w} assigned you to “${title}”${inEvent(et)}.`;
    }
    case "tasks.due_date_changed": {
      const title = taskTitle(metadata);
      const from = formatCalendarDateInZone(
        metadata.dueDateFrom as string | null | undefined,
        tz,
      );
      const to = formatCalendarDateInZone(
        metadata.dueDateTo as string | null | undefined,
        tz,
      );
      return `${w} changed the due date for “${title}”${inEvent(et)} from ${from} to ${to}.`;
    }
  }
}
