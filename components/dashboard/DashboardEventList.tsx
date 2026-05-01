import Link from "next/link";
import { formatEventDateRangeWithTimeZones } from "@/lib/event-datetime";
import type { DashboardEventRow } from "@/lib/events";

export function DashboardEventList({ rows }: { rows: DashboardEventRow[] }) {
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {rows.map(({ event, role }) => (
        <li key={event.id} className="py-4 first:pt-0 last:pb-0">
          <Link
            href={`/dashboard/events/${event.id}`}
            className="group -mx-2 flex flex-wrap items-start justify-between gap-2 rounded-lg px-2 py-1 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:hover:bg-gray-700/50 dark:focus:ring-offset-gray-800"
          >
            <div>
              <p className="text-lg font-medium group-hover:text-blue-700 dark:group-hover:text-blue-300">
                {event.title}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {formatEventDateRangeWithTimeZones(
                  event.startAt,
                  event.endAt,
                  event.startAtTimeZone,
                  event.endAtTimeZone,
                )}
              </p>
              {event.location && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                  {event.location}
                </p>
              )}
            </div>
            <span
              className={
                role === "creator"
                  ? "shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                  : role === "admin"
                    ? "shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200"
                    : "shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200"
              }
            >
              {role === "creator"
                ? "Organizer"
                : role === "admin"
                  ? "Admin"
                  : "Going"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
