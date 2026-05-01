import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardEventList } from "@/components/dashboard/DashboardEventList";
import { partitionDashboardEvents } from "@/lib/dashboard-events";
import { getEventsForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";

export default async function DashboardPage() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    redirect("/sign-in");
  }

  const dbUser = await getOrCreateUser();
  const memberships = await getEventsForUser(dbUser.id);
  const { noDate, upcoming, past } = partitionDashboardEvents(memberships);
  const hasMainList = noDate.length > 0 || upcoming.length > 0;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      <div className="mb-8 rounded-lg bg-white p-6 shadow dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold">Welcome, {dbUser.name}!</h2>
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
          <div className="space-y-8">
            {!hasMainList && (
              <p className="text-gray-600 dark:text-gray-400">
                No upcoming events on your calendar.
              </p>
            )}
            {noDate.length > 0 && (
              <section aria-labelledby="dashboard-events-no-date-heading">
                <h3
                  id="dashboard-events-no-date-heading"
                  className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Events without a date
                </h3>
                <DashboardEventList rows={noDate} />
              </section>
            )}
            {upcoming.length > 0 && (
              <section aria-labelledby="dashboard-events-upcoming-heading">
                <h3
                  id="dashboard-events-upcoming-heading"
                  className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Upcoming
                </h3>
                <DashboardEventList rows={upcoming} />
              </section>
            )}
            {past.length > 0 && (
              <div>
                <Link
                  href="/dashboard/events/past"
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-800"
                >
                  See Past Events
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
