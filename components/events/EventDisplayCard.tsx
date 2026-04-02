import type { ReactNode } from "react";

export function EventDisplayCard({
  title,
  role,
  dateRangeLabel,
  location,
  description,
  headerRight,
}: {
  title: string;
  role: string;
  dateRangeLabel: string;
  location: string | null;
  description: string | null;
  /** e.g. edit/settings control from the parent */
  headerRight?: ReactNode;
}) {
  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <h2 className="text-2xl font-semibold min-w-0 flex-1 pr-2">{title}</h2>
        <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
          <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:text-gray-200 capitalize">
            {role}
          </span>
          {headerRight}
        </div>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
        {dateRangeLabel}
      </p>
      {location && (
        <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
          {location}
        </p>
      )}
      {description && (
        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {description}
        </p>
      )}
    </div>
  );
}
