"use client";

import { createEventFromNaturalLanguage } from "@/app/actions/events";
import { useState, useTransition } from "react";

export function DescribeEventForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <h2 className="text-lg font-semibold mb-1">Describe in plain English</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        We use Claude to pull out title, time, place, and details, then create
        the event for you.
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const description = String(fd.get("description") ?? "");

          setError(null);

          startTransition(async () => {
            const result = await createEventFromNaturalLanguage(description);
            if (!result.ok) {
              setError(result.error);
            }
          });
        }}
      >
        {error && (
          <p
            className="text-sm text-red-700 dark:text-red-400 rounded-md bg-red-50 dark:bg-red-950/50 px-3 py-2 border border-red-200 dark:border-red-900"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="event-nl-description" className="text-sm font-medium">
            What&apos;s the event?
          </label>
          <textarea
            id="event-nl-description"
            name="description"
            required
            rows={5}
            disabled={isPending}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-y min-h-[7rem] disabled:opacity-60"
            placeholder='e.g. "Team offsite next Friday 9am–5pm at the downtown WeWork, lunch included"'
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-fit items-center justify-center rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:pointer-events-none"
        >
          {isPending ? "Creating…" : "Create from description"}
        </button>
      </form>
    </div>
  );
}
