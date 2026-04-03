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
    <div className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 pr-2 text-2xl font-semibold">{title}</h2>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-800 dark:bg-gray-700 dark:text-gray-200">
            {role}
          </span>
          {headerRight}
        </div>
      </div>
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
        {dateRangeLabel}
      </p>
      {location && (
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-500">
          {location}
        </p>
      )}
      {description && (
        <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
          {description}
        </p>
      )}
    </div>
  );
}
