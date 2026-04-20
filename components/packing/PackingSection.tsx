import { MyPackingCommitments } from "./MyPackingCommitments";
import { PackingListPanel } from "./PackingListPanel";
import type { PackingCommitmentForUser } from "@/lib/packing-list";

export function PackingSection({
  eventId,
  canManagePacking,
  liveblocksRoomId,
  commitments,
  packingListPath,
}: {
  eventId: string;
  canManagePacking: boolean;
  liveblocksRoomId: string | null;
  commitments: PackingCommitmentForUser[];
  packingListPath: string | null;
}) {
  const hasList = packingListPath != null;

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
        />
      )}
      {hasList && (
        <MyPackingCommitments
          embedded
          showTopBorder={canManagePacking && hasList}
          showOpenListLink={!canManagePacking}
          eventId={eventId}
          commitments={commitments}
          packingListPath={packingListPath}
        />
      )}
    </section>
  );
}
