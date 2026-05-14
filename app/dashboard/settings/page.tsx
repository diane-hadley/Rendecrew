import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationPreferencesForm } from "@/components/user-settings/NotificationPreferencesForm";
import { UserTimezoneForm } from "@/components/user-settings/UserTimezoneForm";
import { loadDisabledNotificationKindsForUser } from "@/lib/notifications";
import { getOrCreateUser } from "@/lib/user";

export default async function DashboardSettingsPage() {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    redirect("/sign-in");
  }

  const dbUser = await getOrCreateUser();
  const disabledKinds = await loadDisabledNotificationKindsForUser(dbUser.id);
  const notifPrefs = { disabledKinds };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">User settings</h1>
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

      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-2 text-lg font-semibold">Notifications</h2>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          You can override these settings for a particular event from the
          event&apos;s Settings tab.
        </p>
        <NotificationPreferencesForm
          initialDisabledKinds={notifPrefs.disabledKinds}
        />
      </div>
    </div>
  );
}
