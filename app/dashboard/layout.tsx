import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { countUnreadNotifications } from "@/lib/notifications";
import { getOrCreateUser } from "@/lib/user";

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
      />
      <path
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.37.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.281z"
      />
      <path
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkUser = await currentUser();
  let unreadCount = 0;
  if (clerkUser) {
    const dbUser = await getOrCreateUser();
    unreadCount = await countUnreadNotifications(dbUser.id);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-8 dark:border-gray-700 dark:bg-gray-900/95">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3">
          <Link
            href="/dashboard/notifications"
            aria-label="Notifications"
            className="group relative inline-flex size-10 items-center justify-center rounded-full border border-gray-200/90 bg-white/90 text-gray-700 shadow-sm ring-1 ring-gray-900/5 transition hover:border-indigo-200/90 hover:bg-gradient-to-br hover:from-indigo-50 hover:to-blue-50/90 hover:text-indigo-900 hover:shadow-md hover:ring-indigo-900/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-200 dark:ring-white/10 dark:hover:border-indigo-500/35 dark:hover:from-indigo-950/50 dark:hover:to-blue-950/40 dark:hover:text-indigo-100 dark:hover:shadow-indigo-950/20 dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-gray-950"
          >
            <BellIcon className="text-gray-600 transition group-hover:text-indigo-700 dark:text-gray-300 dark:group-hover:text-indigo-300" />
            {unreadCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:bg-indigo-500 dark:ring-gray-900">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/dashboard/settings"
            aria-label="User settings"
            className="group inline-flex items-center gap-2 rounded-full border border-gray-200/90 bg-white/90 px-4 py-2 text-sm font-semibold tracking-tight text-gray-700 shadow-sm ring-1 ring-gray-900/5 transition hover:border-blue-200/90 hover:bg-gradient-to-br hover:from-blue-50 hover:to-indigo-50/90 hover:text-blue-900 hover:shadow-md hover:ring-blue-900/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-200 dark:ring-white/10 dark:hover:border-blue-500/35 dark:hover:from-blue-950/50 dark:hover:to-indigo-950/40 dark:hover:text-blue-100 dark:hover:shadow-blue-950/20 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950"
          >
            <SettingsIcon className="text-gray-500 transition duration-300 ease-out group-hover:-rotate-12 group-hover:text-blue-600 dark:text-gray-400 dark:group-hover:text-blue-400" />
            <span>Settings</span>
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <div className="p-4 sm:p-8">{children}</div>
    </div>
  );
}
