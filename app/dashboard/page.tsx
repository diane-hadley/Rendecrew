import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { getEventsForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";

function formatRange(start: Date | null, end: Date | null) {
  if (!start || !end) {
    return "No date set";
  }
  const opts: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };
  return `${start.toLocaleString(undefined, opts)} – ${end.toLocaleString(undefined, opts)}`;
}

export default async function DashboardPage() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    redirect("/sign-in");
  }

  const dbUser = await getOrCreateUser();
  const memberships = await getEventsForUser(dbUser.id);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <UserButton afterSignOutUrl="/" />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">
            Welcome, {dbUser.name}!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Your events — ones you organize or are part of.
          </p>

          <Link
            href="/dashboard/events/new"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            Create New Event
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Your events</h2>

          {memberships.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">
              No events yet.{" "}
              <Link
                href="/dashboard/events/new"
                className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Create your first event
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {memberships.map(({ event, role }) => (
                <li key={event.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-lg">{event.title}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {formatRange(event.startAt, event.endAt)}
                      </p>
                      {event.location && (
                        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                          {event.location}
                        </p>
                      )}
                    </div>
                    <span
                      className={
                        role === "owner"
                          ? "shrink-0 rounded-full bg-blue-100 dark:bg-blue-950 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-200"
                          : "shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:text-gray-200"
                      }
                    >
                      {role === "owner" ? "Owner" : "Going"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
