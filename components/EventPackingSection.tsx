import { MyEventPackingCommitments } from "@/components/MyEventPackingCommitments";
import { PackingListEventPanel } from "@/components/PackingListEventPanel";
import type { PackingCommitmentForUser } from "@/lib/packing-list";

export function EventPackingSection({
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
    <section className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Packing list
      </h2>
      {canManagePacking && (
        <PackingListEventPanel
          embedded
          eventId={eventId}
          liveblocksRoomId={liveblocksRoomId}
        />
      )}
      {hasList && (
        <MyEventPackingCommitments
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
