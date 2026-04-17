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
import { useEffect, useState } from "react";
import { EventRidesBoard } from "./rides/EventRidesBoard";

const tabs = ["overview", "packing", "members", "rides", "settings"] as const;
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
    generalInformation: string | null;
    location: string | null;
    dateRangeLabel: string;
  };
  editInitial: {
    title: string;
    generalInformation: string | null;
    location: string | null;
    startAt: Date | string | null;
    endAt: Date | string | null;
    timezone: string;
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
    packingEnabled: boolean;
    suggestionApprovalRequired: boolean;
    ridesEnabled: boolean;
  };
  /** Event TZ when the event has start/end; otherwise the signed-in user's TZ. */
  ridesDefaultTimeZone: string;
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
  ridesDefaultTimeZone,
  membersInitial,
}: EventDetailClientProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const [isEditing, setIsEditing] = useState(false);

  const roleLabel = formatEventRoleLabel(actorRole);
  const showPackingTab =
    settings.packingEnabled &&
    (packing.packingListPath != null || packing.canManagePacking);
  const visibleTabs = tabs.filter((t) =>
    t === "rides"
      ? settings.ridesEnabled
      : t === "packing"
        ? showPackingTab
        : true,
  );

  useEffect(() => {
    if (tab === "rides" && !settings.ridesEnabled) {
      setTab("overview");
    }
    if (tab === "packing" && !showPackingTab) {
      setTab("overview");
    }
  }, [tab, settings.ridesEnabled, showPackingTab]);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <nav
          aria-label="Event sections"
          className="flex shrink-0 flex-wrap gap-2 lg:w-48 lg:flex-col"
        >
          {visibleTabs.map((t) => (
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
                : t === "packing"
                  ? "Packing list"
                  : t === "members"
                    ? "Members"
                    : t === "rides"
                      ? "Rides"
                      : "Settings"}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {tab === "overview" && (
            <>
              {editable && isEditing ? (
                <EditEventForm
                  key={eventId}
                  eventId={eventId}
                  initial={editInitial}
                  onCancel={() => setIsEditing(false)}
                  onSaved={() => setIsEditing(false)}
                />
              ) : (
                <>
                  {editable ? (
                    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-gray-700 dark:bg-gray-900/40">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Update the event name, schedule, location, and the
                        information everyone sees on this tab.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="inline-flex shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:ring-blue-400"
                      >
                        Edit event information
                      </button>
                    </div>
                  ) : null}
                  <EventDisplayCard
                    role={roleLabel}
                    dateRangeLabel={display.dateRangeLabel}
                    location={display.location}
                    generalInformation={display.generalInformation}
                  />
                </>
              )}

              <EventChat eventId={eventId} />
            </>
          )}

          {tab === "packing" && showPackingTab && (
            <EventPackingSection
              eventId={eventId}
              canManagePacking={packing.canManagePacking}
              liveblocksRoomId={packing.liveblocksRoomId}
              commitments={packing.commitments}
              packingListPath={packing.packingListPath}
              suggestionApprovalRequired={packing.suggestionApprovalRequired}
              pendingSuggestionDraftCount={packing.pendingSuggestionDraftCount}
            />
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

          {tab === "rides" && settings.ridesEnabled && (
            <EventRidesBoard
              eventId={eventId}
              currentUserId={currentUserId}
              defaultTimeZone={ridesDefaultTimeZone}
              members={membersInitial.map((m) => ({
                membershipId: m.membershipId,
                userId: m.userId,
                name: m.name,
                email: m.email,
              }))}
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
