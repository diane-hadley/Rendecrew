import { DateTime } from "luxon";

/** When no valid zone is known (new users, empty fallbacks). */
export const APP_DEFAULT_TIME_ZONE = "America/Los_Angeles";

const WALL_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isValidIanaTimeZone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  return DateTime.now().setZone(t).isValid;
}

export function normalizeTimeZone(
  input: string | null | undefined,
  fallback: string,
): string {
  const candidate = input?.trim();
  if (candidate && isValidIanaTimeZone(candidate)) {
    return candidate;
  }
  const fb = fallback.trim() || APP_DEFAULT_TIME_ZONE;
  return isValidIanaTimeZone(fb) ? fb : APP_DEFAULT_TIME_ZONE;
}

/**
 * Parse a wall-clock `YYYY-MM-DDTHH:mm` in `eventTimeZone`, or an ISO instant string, into a UTC `Date`.
 */
export function parseEventDateTime(
  value: Date | string | null | undefined,
  eventTimeZone: string,
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (WALL_LOCAL_PATTERN.test(s)) {
    const dt = DateTime.fromISO(s, { zone: eventTimeZone });
    return dt.isValid ? dt.toUTC().toJSDate() : null;
  }
  const dt = DateTime.fromISO(s, { setZone: true });
  if (dt.isValid) return dt.toUTC().toJSDate();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a stored UTC instant as wall `YYYY-MM-DDTHH:mm` in the given IANA zone. */
export function utcToWallDatetimeLocal(
  iso: string | Date | null | undefined,
  timeZone: string,
): string {
  if (iso == null || iso === "") return "";
  const dt =
    typeof iso === "string"
      ? DateTime.fromISO(iso, { zone: "utc" })
      : DateTime.fromJSDate(iso, { zone: "utc" });
  if (!dt.isValid) return "";
  const z = dt.setZone(timeZone);
  if (!z.isValid) return "";
  return z.toFormat("yyyy-MM-dd'T'HH:mm");
}

/** When the user changes the event timezone, keep the same instants, new wall labels. */
export function rezoneWallDatetimeLocal(
  wall: string,
  fromZone: string,
  toZone: string,
): string {
  if (!wall.trim()) return wall;
  const dt = DateTime.fromISO(wall, { zone: fromZone });
  if (!dt.isValid) return wall;
  const next = dt.setZone(toZone);
  if (!next.isValid) return wall;
  return next.toFormat("yyyy-MM-dd'T'HH:mm");
}

function timeZoneAbbreviation(at: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/**
 * Human-readable range in the event zone, plus explicit IANA (and abbreviation when available).
 */
export function formatEventDateRangeWithTimeZone(
  start: Date | null,
  end: Date | null,
  timeZone: string,
  locale?: string,
): string {
  if (!start || !end) {
    return "No date set";
  }
  const opts: Intl.DateTimeFormatOptions = {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  };
  const loc = locale ?? undefined;
  const range = `${start.toLocaleString(loc, opts)} – ${end.toLocaleString(loc, opts)}`;
  const abbr = timeZoneAbbreviation(start, timeZone);
  const zoneSuffix =
    abbr && abbr !== timeZone
      ? `${abbr} · ${timeZone}`
      : timeZone;
  return `${range} (${zoneSuffix})`;
}

export type TimezoneSelectChoice = {
  id: string;
  label: string;
  group: string;
};

/**
 * Short list of common IANA zones with plain-language labels (not the full tz database).
 */
const SELECTABLE_TIMEZONE_CHOICES: TimezoneSelectChoice[] = [
  { group: "General", id: "UTC", label: "UTC" },

  { group: "Americas", id: "America/New_York", label: "Eastern (US & Canada)" },
  { group: "Americas", id: "America/Chicago", label: "Central (US & Canada)" },
  { group: "Americas", id: "America/Denver", label: "Mountain (US & Canada)" },
  { group: "Americas", id: "America/Phoenix", label: "Arizona (no DST)" },
  { group: "Americas", id: "America/Los_Angeles", label: "Pacific (US & Canada)" },
  { group: "Americas", id: "America/Anchorage", label: "Alaska" },
  { group: "Americas", id: "Pacific/Honolulu", label: "Hawaii" },
  { group: "Americas", id: "America/Toronto", label: "Toronto" },
  { group: "Americas", id: "America/Vancouver", label: "Vancouver" },
  { group: "Americas", id: "America/Mexico_City", label: "Mexico City" },
  { group: "Americas", id: "America/Sao_Paulo", label: "São Paulo" },
  { group: "Americas", id: "America/Buenos_Aires", label: "Buenos Aires" },
  { group: "Americas", id: "America/Santiago", label: "Santiago" },

  { group: "Europe", id: "Europe/London", label: "London" },
  { group: "Europe", id: "Europe/Dublin", label: "Dublin" },
  { group: "Europe", id: "Europe/Paris", label: "Paris" },
  { group: "Europe", id: "Europe/Berlin", label: "Berlin" },
  { group: "Europe", id: "Europe/Madrid", label: "Madrid" },
  { group: "Europe", id: "Europe/Rome", label: "Rome" },
  { group: "Europe", id: "Europe/Amsterdam", label: "Amsterdam" },
  { group: "Europe", id: "Europe/Zurich", label: "Zurich" },
  { group: "Europe", id: "Europe/Warsaw", label: "Warsaw" },
  { group: "Europe", id: "Europe/Athens", label: "Athens" },
  { group: "Europe", id: "Europe/Istanbul", label: "Istanbul" },
  { group: "Europe", id: "Europe/Moscow", label: "Moscow" },

  { group: "Africa", id: "Africa/Cairo", label: "Cairo" },
  { group: "Africa", id: "Africa/Johannesburg", label: "Johannesburg" },
  { group: "Africa", id: "Africa/Lagos", label: "Lagos" },
  { group: "Africa", id: "Africa/Nairobi", label: "Nairobi" },

  { group: "Asia", id: "Asia/Dubai", label: "Dubai" },
  { group: "Asia", id: "Asia/Kolkata", label: "India" },
  { group: "Asia", id: "Asia/Bangkok", label: "Bangkok" },
  { group: "Asia", id: "Asia/Singapore", label: "Singapore" },
  { group: "Asia", id: "Asia/Hong_Kong", label: "Hong Kong" },
  { group: "Asia", id: "Asia/Shanghai", label: "Shanghai" },
  { group: "Asia", id: "Asia/Tokyo", label: "Tokyo" },
  { group: "Asia", id: "Asia/Seoul", label: "Seoul" },
  { group: "Asia", id: "Asia/Manila", label: "Manila" },

  { group: "Pacific", id: "Australia/Sydney", label: "Sydney" },
  { group: "Pacific", id: "Australia/Melbourne", label: "Melbourne" },
  { group: "Pacific", id: "Australia/Perth", label: "Perth" },
  { group: "Pacific", id: "Pacific/Auckland", label: "Auckland" },
];

const CURATED_TIMEZONE_IDS = new Set(
  SELECTABLE_TIMEZONE_CHOICES.map((c) => c.id),
);

const TIMEZONE_GROUP_ORDER = [
  "Other",
  "General",
  "Americas",
  "Europe",
  "Africa",
  "Asia",
  "Pacific",
] as const;

/**
 * Choices for `<select>`: curated zones plus the current value when it is a valid
 * IANA id not already listed (e.g. legacy data).
 */
export function getTimezoneSelectChoices(
  currentId: string,
): { group: string; choices: TimezoneSelectChoice[] }[] {
  const trimmed = currentId.trim();
  const extra: TimezoneSelectChoice[] = [];
  if (
    trimmed &&
    !CURATED_TIMEZONE_IDS.has(trimmed) &&
    isValidIanaTimeZone(trimmed)
  ) {
    extra.push({
      group: "Other",
      id: trimmed,
      label: `${trimmed} (your setting)`,
    });
  }

  const flat = [...extra, ...SELECTABLE_TIMEZONE_CHOICES];
  const byGroup = new Map<string, TimezoneSelectChoice[]>();
  for (const c of flat) {
    const list = byGroup.get(c.group) ?? [];
    list.push(c);
    byGroup.set(c.group, list);
  }

  return TIMEZONE_GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({
    group,
    choices: byGroup.get(group)!,
  }));
}
