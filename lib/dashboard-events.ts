import { DateTime } from "luxon";
import type { DashboardEventRow } from "./events";
import { normalizeTimeZone } from "./event-datetime";

type PartitionedDashboardEvents = {
  noDate: DashboardEventRow[];
  upcoming: DashboardEventRow[];
  past: DashboardEventRow[];
};

/**
 * Splits dashboard rows: missing start/end at top; past (end before today in
 * `endAtTimeZone`) excluded from upcoming; upcoming ordered soonest-first; past
 * ordered by end instant descending.
 */
export function partitionDashboardEvents(
  rows: DashboardEventRow[],
  now: Date = new Date(),
): PartitionedDashboardEvents {
  const noDate: DashboardEventRow[] = [];
  const upcoming: DashboardEventRow[] = [];
  const past: DashboardEventRow[] = [];
  const nowUtc = DateTime.fromJSDate(now, { zone: "utc" });
  const todayStartByZone = new Map<string, DateTime>();

  for (const row of rows) {
    const { startAt, endAt, endAtTimeZone } = row.event;
    if (!startAt || !endAt) {
      noDate.push(row);
      continue;
    }
    const endTz = normalizeTimeZone(endAtTimeZone);
    const todayStart =
      todayStartByZone.get(endTz) ?? nowUtc.setZone(endTz).startOf("day");
    todayStartByZone.set(endTz, todayStart);
    const endInstant = DateTime.fromJSDate(endAt, { zone: "utc" });
    if (endInstant < todayStart) {
      past.push(row);
    } else {
      upcoming.push(row);
    }
  }

  noDate.sort(
    (a, b) => b.event.createdAt.getTime() - a.event.createdAt.getTime(),
  );
  upcoming.sort(
    (a, b) => a.event.startAt!.getTime() - b.event.startAt!.getTime(),
  );
  past.sort((a, b) => b.event.endAt!.getTime() - a.event.endAt!.getTime());

  return { noDate, upcoming, past };
}
