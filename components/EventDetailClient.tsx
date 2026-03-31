"use client";

import { DeleteEventPanel } from "@/components/DeleteEventPanel";
import { EditEventForm } from "@/components/EditEventForm";
import { EventChat } from "@/components/EventChat";
import { EventDisplayCard } from "@/components/EventDisplayCard";
import { EventPackingSection } from "@/components/EventPackingSection";
import type { PackingCommitmentForUser } from "@/lib/packing-list";
import { useState } from "react";

export type EventDetailClientProps = {
  eventId: string;
  editable: boolean;
  role: string;
  display: {
    title: string;
    description: string | null;
    location: string | null;
    dateRangeLabel: string;
  };
  editInitial: {
    title: string;
    description: string | null;
    location: string | null;
    startAt: Date | string | null;
    endAt: Date | string | null;
  };
  packing: {
    canManagePacking: boolean;
    liveblocksRoomId: string | null;
    commitments: PackingCommitmentForUser[];
    packingListPath: string | null;
  };
};

export function EventDetailClient({
  eventId,
  editable,
  role,
  display,
  editInitial,
  packing,
}: EventDetailClientProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="w-full space-y-6">
      {editable && isEditing ? (
        <EditEventForm
          eventId={eventId}
          initial={editInitial}
          onCancel={() => setIsEditing(false)}
          onSaved={() => setIsEditing(false)}
        />
      ) : (
        <>
          <EventDisplayCard
            title={display.title}
            role={role}
            dateRangeLabel={display.dateRangeLabel}
            location={display.location}
            description={display.description}
            headerRight={
              editable ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  aria-label="Event settings"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
                    />
                  </svg>
                </button>
              ) : undefined
            }
          />
        </>
      )}

      <EventPackingSection
        eventId={eventId}
        canManagePacking={packing.canManagePacking}
        liveblocksRoomId={packing.liveblocksRoomId}
        commitments={packing.commitments}
        packingListPath={packing.packingListPath}
      />

      <EventChat eventId={eventId} />

      {editable && isEditing && (
        <DeleteEventPanel eventId={eventId} eventTitle={display.title} />
      )}
    </div>
  );
}
