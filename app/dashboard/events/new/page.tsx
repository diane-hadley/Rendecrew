import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { CreateEventForm } from "@/components/events/CreateEventForm";
import { DescribeEventForm } from "@/components/events/DescribeEventForm";

export default async function NewEventPage() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Create New Event</h1>
          <UserButton afterSignOutUrl="/" />
        </div>

        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            ← Back to dashboard
          </Link>
        </div>

        <div className="flex max-w-xl flex-col gap-8">
          <DescribeEventForm />
          <div>
            <h2 className="mb-4 text-lg font-semibold">Or fill in the form</h2>
            <CreateEventForm />
          </div>
        </div>
      </div>
    </div>
  );
}
