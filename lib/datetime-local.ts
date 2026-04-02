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

export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocalMs(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Snap to nearest 5 minutes in local time (handles day/month rollover). */
export function snapDatetimeLocalToFiveMinutes(value: string): string {
  if (!value.trim()) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const fiveMs = 5 * 60 * 1000;
  const snapped = new Date(Math.round(d.getTime() / fiveMs) * fiveMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${snapped.getFullYear()}-${pad(snapped.getMonth() + 1)}-${pad(snapped.getDate())}T${pad(snapped.getHours())}:${pad(snapped.getMinutes())}`;
}

/** Hour/minute strings on the 5-minute grid (for `HH:mm` parts, 24-hour). */
export function splitTimeToHourMinuteFive(time: string): {
  hour: string;
  minute: string;
} {
  if (!/^\d{2}:\d{2}$/.test(time)) return { hour: "00", minute: "00" };
  const snapped = snapDatetimeLocalToFiveMinutes(`2000-01-01T${time}`);
  const part = snapped.split("T")[1] ?? "00:00";
  const [h, m] = part.split(":");
  return { hour: h ?? "00", minute: m ?? "00" };
}

/** `hour24` is two-digit 00–23. */
export function hour24ToHour12AndPeriod(hour24: string): {
  hour12: string;
  period: "AM" | "PM";
} {
  const h = parseInt(hour24, 10);
  if (Number.isNaN(h) || h < 0 || h > 23) return { hour12: "12", period: "AM" };
  if (h === 0) return { hour12: "12", period: "AM" };
  if (h < 12) return { hour12: String(h), period: "AM" };
  if (h === 12) return { hour12: "12", period: "PM" };
  return { hour12: String(h - 12), period: "PM" };
}

/** `hour12` is 1–12 as string (e.g. "1" … "12"). Returns two-digit 00–23. */
export function hour12PeriodToHour24(
  hour12: string,
  period: "AM" | "PM",
): string {
  const h = parseInt(hour12, 10);
  if (Number.isNaN(h) || h < 1 || h > 12) return "00";
  if (period === "AM") {
    if (h === 12) return "00";
    return String(h).padStart(2, "0");
  }
  if (h === 12) return "12";
  return String(h + 12).padStart(2, "0");
}

/** When start changes: copy start to end if end is empty or end is before start. */
export function shouldSyncEndToStart(start: string, end: string): boolean {
  const startMs = parseDatetimeLocalMs(start);
  if (startMs == null) return false;
  if (!end.trim()) return true;
  const endMs = parseDatetimeLocalMs(end);
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
