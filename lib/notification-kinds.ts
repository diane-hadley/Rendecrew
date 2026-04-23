/** Stable notification kind keys (spec 0006, sections 3.2–3.5). */
export const NOTIFICATION_KINDS = [
  "event.member_added",
  "event.member_removed",
  "packing.signup_or_quantity",
  "packing.removed_from_item",
  "rides.passenger_joined_my_car",
  "rides.driver_assignment_changed",
  "rides.car_assignment_changed",
  "tasks.assignment_changed",
  "tasks.due_date_changed",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const KIND_SET = new Set<string>(NOTIFICATION_KINDS);

export function isNotificationKind(v: string): v is NotificationKind {
  return KIND_SET.has(v);
}

export type NotificationCategoryId = "event" | "packing" | "rides" | "tasks";

export type NotificationKindUiMeta = {
  kind: NotificationKind;
  category: NotificationCategoryId;
  label: string;
};

export const NOTIFICATION_KIND_UI: readonly NotificationKindUiMeta[] = [
  {
    kind: "event.member_added",
    category: "event",
    label: "Added to an event",
  },
  {
    kind: "event.member_removed",
    category: "event",
    label: "Removed from an event",
  },
  {
    kind: "packing.signup_or_quantity",
    category: "packing",
    label: "Packing sign-up or quantity",
  },
  {
    kind: "packing.removed_from_item",
    category: "packing",
    label: "Removed from a packing item",
  },
  {
    kind: "rides.passenger_joined_my_car",
    category: "rides",
    label: "Someone joined my car",
  },
  {
    kind: "rides.driver_assignment_changed",
    category: "rides",
    label: "Driver assignment changed",
  },
  {
    kind: "rides.car_assignment_changed",
    category: "rides",
    label: "Car / passenger assignment changed",
  },
  {
    kind: "tasks.assignment_changed",
    category: "tasks",
    label: "Task assignment changed",
  },
  {
    kind: "tasks.due_date_changed",
    category: "tasks",
    label: "Task due date changed",
  },
] as const;

export const CATEGORY_LABELS: Record<NotificationCategoryId, string> = {
  event: "Event",
  packing: "Packing",
  rides: "Rides",
  tasks: "Tasks",
};

const PER_EVENT_OVERRIDE_KIND_SET = new Set(
  NOTIFICATION_KIND_UI.filter((row) => row.category !== "event").map(
    (row) => row.kind,
  ),
);

/** Event membership kinds follow account settings only; per-event JSON overrides are ignored. */
export function allowsPerEventNotificationOverride(
  kind: NotificationKind,
): boolean {
  return PER_EVENT_OVERRIDE_KIND_SET.has(kind);
}
