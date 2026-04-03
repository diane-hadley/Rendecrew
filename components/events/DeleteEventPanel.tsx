"use client";

import { deleteEvent } from "@/app/actions/events";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type DeleteEventPanelProps = {
  eventId: string;
  eventTitle: string;
};

export function DeleteEventPanel({
  eventId,
  eventTitle,
}: DeleteEventPanelProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-8 w-full border-t border-gray-200 pt-6 dark:border-gray-700">
      {!showConfirm ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowConfirm(true);
          }}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-red-800 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:ring-offset-gray-800"
        >
          Delete event
        </button>
      ) : (
        <div
          className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30"
          role="region"
          aria-label="Confirm delete event"
        >
          <p className="text-sm font-medium text-red-900 dark:text-red-200">
            Delete &quot;{eventTitle}&quot;?
          </p>
          <p className="text-sm text-red-800 dark:text-red-300">
            This permanently removes the event and all memberships. This cannot
            be undone.
          </p>
          {error && (
            <p
              className="rounded-md border border-red-200 bg-white/80 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-gray-900/80 dark:text-red-400"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setError(null);
                setShowConfirm(false);
              }}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus:ring-offset-gray-900"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await deleteEvent(eventId);
                  if (!result.ok) {
                    setError(result.error);
                  } else {
                    router.push("/dashboard");
                  }
                });
              }}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-900"
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
