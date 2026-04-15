import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserTimezoneForm } from "@/components/settings/UserTimezoneForm";
import { getOrCreateUser } from "@/lib/user";

export default async function DashboardSettingsPage() {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    redirect("/sign-in");
  }

  const dbUser = await getOrCreateUser();

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">User settings</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Account preferences for your signed-in profile.
        </p>
      </div>

      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold">Timezone</h2>
        <UserTimezoneForm initialTimeZone={dbUser.timezone} />
      </div>
    </div>
  );
}
