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
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <UserButton afterSignOutUrl="/" />
        </div>

        <div className="mb-8 rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">
            Welcome, {dbUser.name}!
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Your events — ones you organize or are part of.
          </p>

          <Link
            href="/dashboard/events/new"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            Create New Event
          </Link>
        </div>

        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Your events</h2>

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
                  <Link
                    href={`/dashboard/events/${event.id}`}
                    className="group -mx-2 flex flex-wrap items-start justify-between gap-2 rounded-lg px-2 py-1 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:hover:bg-gray-700/50 dark:focus:ring-offset-gray-800"
                  >
                    <div>
                      <p className="text-lg font-medium group-hover:text-blue-700 dark:group-hover:text-blue-300">
                        {event.title}
                      </p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {formatRange(event.startAt, event.endAt)}
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
          )}
        </div>
      </div>
    </div>
  );
}
