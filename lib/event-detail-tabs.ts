/** Tab ids in `EventDetailClient` and `?tab=` for deep links. */
export const EVENT_DETAIL_TAB_IDS = [
  "overview",
  "tasks",
  "packing",
  "rides",
  "members",
  "settings",
] as const;

export type EventDetailTabId = (typeof EVENT_DETAIL_TAB_IDS)[number];

export function isEventDetailTabId(
  v: string | null | undefined,
): v is EventDetailTabId {
  return v != null && (EVENT_DETAIL_TAB_IDS as readonly string[]).includes(v);
}

/**
 * `?tab=` from the request, or null for default (overview).
 */
export function parseEventDetailTabParam(
  raw: string | string[] | null | undefined,
): EventDetailTabId | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  return isEventDetailTabId(t) ? t : null;
}
