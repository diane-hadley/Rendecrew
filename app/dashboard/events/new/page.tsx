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
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
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

        <div className="flex flex-col gap-8 max-w-xl">
          <DescribeEventForm />
          <div>
            <h2 className="text-lg font-semibold mb-4">Or fill in the form</h2>
            <CreateEventForm />
          </div>
        </div>
      </div>
    </div>
  );
}
