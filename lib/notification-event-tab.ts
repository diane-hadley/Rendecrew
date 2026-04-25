import type { EventDetailTabId } from "./event-detail-tabs";
import {
  isNotificationKind,
  type NotificationKind,
} from "./notification-kinds";

const NOTIFICATION_KIND_TO_TAB: Record<NotificationKind, EventDetailTabId> = {
  "event.member_added": "members",
  "event.member_removed": "members",
  "packing.signup_or_quantity": "packing",
  "packing.removed_from_item": "packing",
  "rides.passenger_joined_my_car": "rides",
  "rides.driver_assignment_changed": "rides",
  "rides.car_assignment_changed": "rides",
  "tasks.assignment_changed": "tasks",
  "tasks.due_date_changed": "tasks",
};

/** `?tab=` value for the event page when opening from a notification. */
export function eventDetailTabForNotificationKind(
  kind: string,
): EventDetailTabId | null {
  if (!isNotificationKind(kind)) return null;
  return NOTIFICATION_KIND_TO_TAB[kind] ?? null;
}
