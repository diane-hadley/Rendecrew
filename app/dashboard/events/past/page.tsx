import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardEventList } from "@/components/dashboard/DashboardEventList";
import { partitionDashboardEvents } from "@/lib/dashboard-events";
import { getEventsForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";

export default async function PastEventsPage() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    redirect("/sign-in");
  }

  const dbUser = await getOrCreateUser();
  const memberships = await getEventsForUser(dbUser.id);
  const { past } = partitionDashboardEvents(memberships);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Past events</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Events that have already ended, newest first.
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
        {past.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No past events.</p>
        ) : (
          <DashboardEventList rows={past} />
        )}
      </div>
    </div>
  );
}
