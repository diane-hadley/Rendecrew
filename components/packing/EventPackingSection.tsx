import { EventPackingSuggestionSettings } from "./EventPackingSuggestionSettings";
import { MyEventPackingCommitments } from "./MyEventPackingCommitments";
import { PackingListEventPanel } from "./PackingListEventPanel";
import type { PackingCommitmentForUser } from "@/lib/packing-list";

export function EventPackingSection({
  eventId,
  canManagePacking,
  liveblocksRoomId,
  commitments,
  packingListPath,
  suggestionApprovalRequired,
  pendingSuggestionDraftCount,
}: {
  eventId: string;
  canManagePacking: boolean;
  liveblocksRoomId: string | null;
  commitments: PackingCommitmentForUser[];
  packingListPath: string | null;
  suggestionApprovalRequired?: boolean;
  pendingSuggestionDraftCount?: number;
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
        <PackingListEventPanel
          embedded
          eventId={eventId}
          liveblocksRoomId={liveblocksRoomId}
        />
      )}
      {canManagePacking &&
        hasList &&
        suggestionApprovalRequired !== undefined &&
        pendingSuggestionDraftCount !== undefined && (
          <EventPackingSuggestionSettings
            eventId={eventId}
            approvalRequired={suggestionApprovalRequired}
            packingListPath={packingListPath}
            pendingDraftCount={pendingSuggestionDraftCount}
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
