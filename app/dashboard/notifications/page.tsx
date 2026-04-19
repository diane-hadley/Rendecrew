import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  CATEGORY_LABELS,
  NOTIFICATION_KIND_UI,
  type NotificationCategoryId,
} from "@/lib/notification-kinds";
import {
  listNotificationsForUser,
  markAllNotificationsReadForUser,
} from "@/lib/notifications";
import { getOrCreateUser } from "@/lib/user";
import { DateTime } from "luxon";

function labelForKind(kind: string): string {
  const row = NOTIFICATION_KIND_UI.find((k) => k.kind === kind);
  return row?.label ?? kind;
}

function categoryForKind(kind: string): NotificationCategoryId {
  const row = NOTIFICATION_KIND_UI.find((k) => k.kind === kind);
  return row?.category ?? "event";
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: { c?: string };
}) {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    redirect("/sign-in");
  }

  const user = await getOrCreateUser();

  let cursor: { createdAt: string; id: string } | null = null;
  if (searchParams?.c) {
    try {
      const raw = Buffer.from(
        decodeURIComponent(searchParams.c),
        "base64url",
      ).toString("utf-8");
      const o = JSON.parse(raw) as { createdAt?: string; id?: string };
      if (o.createdAt && o.id) cursor = { createdAt: o.createdAt, id: o.id };
    } catch {
      /* ignore invalid cursor */
    }
  }

  if (!cursor) {
    await markAllNotificationsReadForUser(user.id);
    revalidatePath("/dashboard");
  }

  const { items, nextCursor } = await listNotificationsForUser({
    userId: user.id,
    take: 30,
    cursor,
  });

  const tz = user.timezone;
  const nextHref = nextCursor
    ? `/dashboard/notifications?c=${encodeURIComponent(
        Buffer.from(JSON.stringify(nextCursor), "utf-8").toString("base64url"),
      )}`
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          ← Dashboard
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
        Notifications
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {!cursor ? "Opening this page marks all notifications as read." : null}{" "}
        Times use your account timezone ({tz}).
      </p>

      {items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {cursor
            ? "No older notifications."
            : "You have no notifications yet."}
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-900">
          {items.map((n) => {
            const meta = n.metadata as {
              eventId?: string;
              taskId?: string;
              rideCarId?: string;
              packingItemId?: string;
            };
            const when = DateTime.fromISO(n.createdAt, { zone: "utc" }).setZone(
              tz,
            );
            const whenLabel = when.toLocaleString(DateTime.DATETIME_MED);
            const cat = categoryForKind(n.kind);
            const href =
              meta.eventId != null
                ? `/dashboard/events/${meta.eventId}`
                : "/dashboard";

            return (
              <li key={n.id} className="p-4 sm:px-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {CATEGORY_LABELS[cat]}
                    </p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {labelForKind(n.kind)}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      <Link
                        href={href}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        View event
                      </Link>
                      {meta.taskId ? (
                        <span className="text-gray-400"> · Task</span>
                      ) : null}
                      {meta.rideCarId ? (
                        <span className="text-gray-400"> · Rides</span>
                      ) : null}
                      {meta.packingItemId ? (
                        <span className="text-gray-400"> · Packing</span>
                      ) : null}
                    </p>
                  </div>
                  <time
                    dateTime={n.createdAt}
                    className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
                  >
                    {whenLabel}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nextHref ? (
        <div className="mt-6 text-center">
          <Link
            href={nextHref}
            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Load older
          </Link>
        </div>
      ) : null}
    </div>
  );
}
