"use client";

import type {
  EventMemberRole,
  MemberManagementPolicy,
  PackingListVisibility,
} from "@prisma/client";
import { EventPackingSection } from "@/components/packing/EventPackingSection";
import { EditEventForm } from "./EditEventForm";
import { EventChat } from "./EventChat";
import { EventDisplayCard } from "./EventDisplayCard";
import { EventMembersSection } from "./EventMembersSection";
import { EventSettingsForm } from "./EventSettingsForm";
import type { EventMemberListItem } from "@/app/actions/event-members";
import type { PackingCommitmentForUser } from "@/lib/packing-list";
import { formatEventRoleLabel } from "@/lib/event-role-utils";
import { useState } from "react";

const tabs = ["overview", "members", "settings"] as const;
type TabId = (typeof tabs)[number];

export type EventDetailClientProps = {
  eventId: string;
  createdById: string;
  currentUserId: string;
  actorRole: EventMemberRole;
  isCreator: boolean;
  editable: boolean;
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
    suggestionApprovalRequired: boolean;
    pendingSuggestionDraftCount: number;
  };
  settings: {
    memberManagementPolicy: MemberManagementPolicy;
    packingListVisibility: PackingListVisibility;
    suggestionApprovalRequired: boolean;
  };
  membersInitial: EventMemberListItem[];
};

export function EventDetailClient({
  eventId,
  createdById,
  currentUserId,
  actorRole,
  isCreator,
  editable,
  display,
  editInitial,
  packing,
  settings,
  membersInitial,
}: EventDetailClientProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const [isEditing, setIsEditing] = useState(false);

  const roleLabel = formatEventRoleLabel(actorRole);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <nav
          aria-label="Event sections"
          className="flex shrink-0 flex-wrap gap-2 lg:w-48 lg:flex-col"
        >
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? "rounded-md bg-blue-600 px-4 py-2 text-left text-sm font-medium text-white"
                  : "rounded-md bg-gray-100 px-4 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              }
            >
              {t === "overview"
                ? "Overview"
                : t === "members"
                  ? "Members"
                  : "Settings"}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {tab === "overview" && (
            <>
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
                    role={roleLabel}
                    dateRangeLabel={display.dateRangeLabel}
                    location={display.location}
                    description={display.description}
                    headerRight={
                      editable ? (
                        <button
                          type="button"
                          onClick={() => setIsEditing(true)}
                          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:ring-blue-400"
                          aria-label="Edit event details"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="size-5"
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
                suggestionApprovalRequired={packing.suggestionApprovalRequired}
                pendingSuggestionDraftCount={
                  packing.pendingSuggestionDraftCount
                }
              />

              <EventChat eventId={eventId} />
            </>
          )}

          {tab === "members" && (
            <EventMembersSection
              eventId={eventId}
              createdById={createdById}
              currentUserId={currentUserId}
              actorRole={actorRole}
              memberManagementPolicy={settings.memberManagementPolicy}
              initialMembers={membersInitial}
            />
          )}

          {tab === "settings" && (
            <EventSettingsForm
              eventId={eventId}
              eventTitle={display.title}
              canEdit={editable}
              isCreator={isCreator}
              initial={settings}
            />
          )}
        </div>
      </div>
    </div>
  );
}
