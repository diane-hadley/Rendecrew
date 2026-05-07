import { MyPackingCommitments } from "./MyPackingCommitments";
import { PackingListPanel } from "./PackingListPanel";
import type { PackingListVisibility } from "@prisma/client";
import type { PackingCommitmentForUser } from "@/lib/packing-list";
import type { PackingCollabPageData } from "@/lib/packing-collab-page-data";
import dynamic from "next/dynamic";

const PackingCollabPage = dynamic(
  () =>
    import("./PackingCollabPage").then((m) => ({
      default: m.PackingCollabPage,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[12rem] animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900"
        aria-hidden
      />
    ),
  },
);

export function PackingSection({
  eventId,
  canManagePacking,
  liveblocksRoomId,
  commitments,
  packingListPath,
  packingListVisibility,
  collab,
}: {
  eventId: string;
  canManagePacking: boolean;
  liveblocksRoomId: string | null;
  commitments: PackingCommitmentForUser[];
  packingListPath: string | null;
  packingListVisibility: PackingListVisibility;
  collab: PackingCollabPageData | null;
}) {
  const hasList = packingListPath != null;
  const showEmbeddedCollab = collab != null;
  const packingListAccessibleByNonUsers =
    packingListVisibility !== "MEMBERS_ONLY";

  if (!hasList && !canManagePacking) {
    return null;
  }

  return (
    <section className="w-full space-y-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Packing list
      </h2>
      {canManagePacking && (
        <PackingListPanel
          embedded
          eventId={eventId}
          liveblocksRoomId={liveblocksRoomId}
          packingListVisibility={packingListVisibility}
        />
      )}
      {showEmbeddedCollab ? (
        <div
          className={
            canManagePacking
              ? "border-t border-gray-200 pt-4 dark:border-gray-700"
              : ""
          }
        >
          <PackingCollabPage {...collab} embedded />
        </div>
      ) : hasList ? (
        <MyPackingCommitments
          embedded
          showTopBorder={canManagePacking && hasList}
          showOpenListLink={!canManagePacking}
          eventId={eventId}
          commitments={commitments}
          packingListPath={packingListPath}
          packingListAccessibleByNonUsers={packingListAccessibleByNonUsers}
        />
      ) : null}
    </section>
  );
}
