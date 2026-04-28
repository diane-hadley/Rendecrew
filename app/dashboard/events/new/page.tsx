import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateEventForm } from "@/components/events/CreateEventForm";
import { DescribeEventForm } from "@/components/events/DescribeEventForm";
import { APP_DEFAULT_TIME_ZONE, normalizeTimeZone } from "@/lib/event-datetime";
import { getOrCreateUser } from "@/lib/user";

export default async function NewEventPage() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    redirect("/sign-in");
  }

  const dbUser = await getOrCreateUser();
  const defaultEventTimeZone = normalizeTimeZone(
    dbUser.timezone,
    APP_DEFAULT_TIME_ZONE,
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create New Event</h1>
      </div>

      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          ← Back to dashboard
        </Link>
      </div>

      <div className="flex w-full max-w-4xl flex-col gap-8">
        <DescribeEventForm />
        <div>
          <h2 className="mb-4 text-lg font-semibold">Or fill in the form</h2>
          <CreateEventForm defaultTimeZone={defaultEventTimeZone} />
        </div>
      </div>
    </div>
  );
}
