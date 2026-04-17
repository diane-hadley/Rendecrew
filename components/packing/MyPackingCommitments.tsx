"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setMyPackingSignUpPacked } from "@/app/actions/packing-list";
import type { PackingCommitmentForUser } from "@/lib/packing-list";

/** How many to bring (personal view: only their count, not the full item total). */
function formatBrings(c: PackingCommitmentForUser): string {
  if (c.signUpQuantity != null) return String(c.signUpQuantity);
  return "—";
}

export function MyPackingCommitments({
  eventId,
  commitments,
  packingListPath,
  embedded = false,
  showTopBorder = false,
  showOpenListLink = true,
}: {
  eventId: string;
  commitments: PackingCommitmentForUser[];
  packingListPath: string | null;
  embedded?: boolean;
  /** When embedded with the collaborative section above, add a divider. */
  showTopBorder?: boolean;
  /** Set false when the collaborative panel already provides an open link (e.g. for organizers). */
  showOpenListLink?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!packingListPath) return null;

  const shell = embedded
    ? showTopBorder
      ? "border-t border-gray-200 dark:border-gray-700 pt-4 mt-1 space-y-3"
      : "space-y-3"
    : "rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4";

  return (
    <div className={shell}>
      <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        You&apos;re bringing
      </h3>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Mark items as packed when you&apos;re done — only you see these
        checkboxes here.
      </p>
      {commitments.length === 0 ? (
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
          You haven&apos;t signed up for any items on this list yet.
        </p>
      ) : (
        <ul className="mb-3 space-y-3">
          {commitments.map((c) => (
            <li
              key={c.signUpId}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-800 dark:text-gray-200"
            >
              <label className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.signUpPacked}
                  disabled={isPending}
                  onChange={(e) => {
                    const next = e.target.checked;
                    startTransition(async () => {
                      const r = await setMyPackingSignUpPacked(
                        eventId,
                        c.signUpId,
                        next,
                      );
                      if (r.ok) router.refresh();
                    });
                  }}
                  className="rounded border-gray-300 dark:border-gray-600"
                  aria-label={`Packed: ${c.itemName}`}
                />
                <span className="font-medium">{c.itemName}</span>
              </label>
              <span className="text-gray-600 dark:text-gray-400">
                {formatBrings(c)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {showOpenListLink && (
        <Link
          href={packingListPath}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          target="_blank"
          rel="noreferrer"
        >
          Open collaborative packing list
        </Link>
      )}
    </div>
  );
}
