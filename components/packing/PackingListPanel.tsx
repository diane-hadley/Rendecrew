"use client";

import { PackingListVisibility } from "@prisma/client";
import { enablePackingListForEvent } from "@/app/actions/packing-list";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function PackingListPanel({
  eventId,
  liveblocksRoomId,
  packingListVisibility,
  embedded = false,
}: {
  eventId: string;
  liveblocksRoomId: string | null;
  packingListVisibility: PackingListVisibility;
  /** Omit outer card when nested inside the event packing section. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  /** Set after mount so server and first client render match (avoids hydration errors). */
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const sharePath = liveblocksRoomId ? `/packing/${liveblocksRoomId}` : null;
  const fullUrl = sharePath && origin ? `${origin}${sharePath}` : null;
  const isAccessibleByNonUsers =
    packingListVisibility === PackingListVisibility.URL_PUBLIC;

  const shell = embedded
    ? "space-y-3"
    : "rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4";

  if (!liveblocksRoomId) {
    return (
      <div className={shell}>
        <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Collaborative packing list
        </h3>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
          {isAccessibleByNonUsers
            ? "Turn on a shared list guests can edit in real time. No account needed to use the link."
            : "Turn on a shared list for event members. Guests will be asked to sign in to access it."}
        </p>
        {error && (
          <p
            className="mb-2 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await enablePackingListForEvent(eventId);
              if (!r.ok) setError(r.error);
              else router.refresh();
            });
          }}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {isPending ? "Enabling…" : "Enable packing list"}
        </button>
      </div>
    );
  }

  // This panel is only meant for sharing a public link. If the list is
  // members-only, hide the entire panel (no title/description/row).
  if (!isAccessibleByNonUsers) {
    return null;
  }

  return (
    <div className={shell}>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Anyone with this link can make changes to the packing list. Use to share
        with members of your group who are not members here.
      </p>
      {sharePath ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded bg-gray-100 px-2 py-1.5 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
            {fullUrl ?? sharePath}
          </code>
          <button
            type="button"
            onClick={async () => {
              const url = fullUrl ?? `${window.location.origin}${sharePath}`;
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={sharePath}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Open list
          </a>
        </div>
      ) : null}
    </div>
  );
}
