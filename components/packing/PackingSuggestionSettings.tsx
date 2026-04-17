"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setSuggestionApprovalRequired } from "@/app/actions/packing-advanced";

export function PackingSuggestionSettings({
  eventId,
  approvalRequired,
  packingListPath,
  pendingDraftCount,
}: {
  eventId: string;
  approvalRequired: boolean;
  packingListPath: string | null;
  pendingDraftCount: number;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(approvalRequired);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/80 p-4 text-sm dark:border-gray-600 dark:bg-gray-900/50">
      <h3 className="font-medium text-gray-900 dark:text-gray-100">
        Suggestion catalog
      </h3>
      <p className="mt-1 text-gray-600 dark:text-gray-400">
        Participants can propose items on the packing page. Control whether new
        ideas need your approval before they appear for everyone.
      </p>
      {error && (
        <p className="mt-2 text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <label className="mt-3 flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 rounded border-gray-300 dark:border-gray-600"
          checked={checked}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setChecked(next);
            setError(null);
            startTransition(async () => {
              const r = await setSuggestionApprovalRequired(eventId, next);
              if (!r.ok) {
                setError(r.error);
                setChecked(!next);
              } else {
                router.refresh();
              }
            });
          }}
        />
        <span className="text-gray-800 dark:text-gray-200">
          Require organizer approval before new suggestions are visible to the
          group
        </span>
      </label>
      {pendingDraftCount > 0 && packingListPath ? (
        <p className="mt-3">
          <Link
            href={`${packingListPath}?tab=suggestions`}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Review {pendingDraftCount} pending suggestion
            {pendingDraftCount === 1 ? "" : "s"}
          </Link>{" "}
          on the packing list (Suggestions tab).
        </p>
      ) : null}
    </div>
  );
}
