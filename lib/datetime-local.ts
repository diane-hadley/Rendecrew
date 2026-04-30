export function splitDatetimeLocal(value: string): {
  date: string;
  time: string;
} {
  if (!value.trim()) return { date: "", time: "" };
  const [datePart, rest] = value.split("T");
  if (!rest) return { date: datePart ?? "", time: "" };
  const timePart = rest.slice(0, 5);
  return {
    date: datePart ?? "",
    time: /^\d{2}:\d{2}$/.test(timePart) ? timePart : "",
  };
}

/** If `date` is empty, returns `""`. Otherwise uses `time` or `00:00`. */
export function joinDatetimeLocal(date: string, time: string): string {
  const d = date.trim();
  if (!d) return "";
  const t = time.trim() || "00:00";
  return `${d}T${t}`;
}

const WALL_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function parseWallDatetimeAsUtcMs(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const { date, time } = splitDatetimeLocal(v);
  if (!date || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, mo, d] = date.split("-").map((x) => parseInt(x, 10));
  const [h, mi] = time.split(":").map((x) => parseInt(x, 10));
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Snap to nearest N minutes using calendar components (no browser local TZ).
 * `minutes` must be an integer 1–60.
 */
export function snapDatetimeLocalToMinutes(
  value: string,
  minutes: number,
): string {
  if (!value.trim()) return "";
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) return value;
  const ms = parseWallDatetimeAsUtcMs(value);
  if (ms == null) return value;
  const stepMs = minutes * 60 * 1000;
  const snapped = new Date(Math.round(ms / stepMs) * stepMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${snapped.getUTCFullYear()}-${pad(snapped.getUTCMonth() + 1)}-${pad(snapped.getUTCDate())}T${pad(snapped.getUTCHours())}:${pad(snapped.getUTCMinutes())}`;
}

/** Snap to nearest 5 minutes using calendar components (no browser local TZ). */
export function snapDatetimeLocalToFiveMinutes(value: string): string {
  return snapDatetimeLocalToMinutes(value, 5);
}

/** When start changes: copy start to end if end is empty or end is before start. */
export function shouldSyncEndToStart(start: string, end: string): boolean {
  const s = start.trim();
  const e = end.trim();
  if (!s) return false;
  if (!e) return true;
  if (WALL_LOCAL_PATTERN.test(s) && WALL_LOCAL_PATTERN.test(e)) {
    return e < s;
  }
  const startMs = parseWallDatetimeAsUtcMs(s);
  if (startMs == null) return false;
  const endMs = parseWallDatetimeAsUtcMs(e);
  if (endMs == null) return true;
  return endMs < startMs;
}

export function normalizeStartEndPair(
  start: string,
  end: string,
): { start: string; end: string } {
  const s = snapDatetimeLocalToFiveMinutes(start);
  const e = snapDatetimeLocalToFiveMinutes(end);
  if (!s) return { start: s, end: e };
  if (shouldSyncEndToStart(s, e)) return { start: s, end: s };
  return { start: s, end: e };
}
