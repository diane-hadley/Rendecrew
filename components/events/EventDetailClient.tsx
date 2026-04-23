"use client";

import type {
  EventMemberRole,
  MemberManagementPolicy,
  PackingListVisibility,
} from "@prisma/client";
import { PackingSection } from "@/components/packing/PackingSection";
import { EditGeneralInformationForm } from "./EditGeneralInformationForm";
import { EditEventDetailsForm } from "./EditEventDetailsForm";
import { Chat } from "./Chat";
import { EventDisplayCard } from "./EventDisplayCard";
import { GeneralInformationMarkdown } from "./GeneralInformationMarkdown";
import { MembersSection } from "./MembersSection";
import { EventSettingsForm } from "@/components/event-settings/EventSettingsForm";
import type { EventMemberListItem } from "@/app/actions/event-members";
import type { PackingCommitmentForUser } from "@/lib/packing-list";
import { formatEventRoleLabel } from "@/lib/event-role-utils";
import { useEffect, useState } from "react";
import { RidesBoard } from "@/components/rides/RidesBoard";
import { TaskBoard } from "@/components/tasks/TaskBoard";

function splitGeneralInformationMarkdown(markdown: string): {
  publicMarkdown: string;
  editingMarkdown: string | null;
} {
  const md = markdown.trim();
  if (!md) return { publicMarkdown: "", editingMarkdown: null };

  const heading =
    /^#{1,6}\s*(editing event info|editing event information|admin notes)\s*$/im;
  const match = md.match(heading);
  if (!match || match.index == null) {
    return { publicMarkdown: md, editingMarkdown: null };
  }

  const publicMarkdown = md.slice(0, match.index).trim();
  const editingMarkdown = md.slice(match.index).trim();
  return {
    publicMarkdown,
    editingMarkdown: editingMarkdown ? editingMarkdown : null,
  };
}

const tabs = [
  "overview",
  "tasks",
  "packing",
  "rides",
  "members",
  "settings",
] as const;
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
    taskBoardEnabled: boolean;
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
  const [isEditingGeneralInformation, setIsEditingGeneralInformation] =
    useState(false);
  const [isEditingEventDetails, setIsEditingEventDetails] = useState(false);

  const roleLabel = formatEventRoleLabel(actorRole);
  const showPackingTab =
    settings.packingEnabled &&
    (packing.packingListPath != null || packing.canManagePacking);
  const visibleTabs = tabs.filter((t) =>
    t === "rides"
      ? settings.ridesEnabled
      : t === "packing"
        ? showPackingTab
        : t === "tasks"
          ? settings.taskBoardEnabled
          : true,
  );

  const splitGeneral = splitGeneralInformationMarkdown(
    display.generalInformation ?? "",
  );

  useEffect(() => {
    if (tab === "rides" && !settings.ridesEnabled) {
      setTab("overview");
    }
    if (tab === "packing" && !showPackingTab) {
      setTab("overview");
    }
    if (tab === "tasks" && !settings.taskBoardEnabled) {
      setTab("overview");
    }
  }, [tab, settings.ridesEnabled, settings.taskBoardEnabled, showPackingTab]);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <nav
          aria-label="Event sections"
          className="flex shrink-0 flex-wrap gap-2 lg:w-48 lg:flex-col"
        >
          {visibleTabs.map((t) => {
            const label =
              t === "overview"
                ? "Overview"
                : t === "tasks"
                  ? "Tasks"
                  : t === "packing"
                    ? "Packing list"
                    : t === "members"
                      ? "Members"
                      : t === "rides"
                        ? "Rides"
                        : "Settings";

            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setIsEditingGeneralInformation(false);
                  setIsEditingEventDetails(false);
                }}
                className={
                  tab === t
                    ? "rounded-md bg-blue-600 px-4 py-2 text-left text-sm font-medium text-white"
                    : "rounded-md bg-gray-100 px-4 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                }
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {tab === "overview" && (
            <>
              {editable && isEditingEventDetails ? (
                <>
                  <EditEventDetailsForm
                    key={eventId}
                    eventId={eventId}
                    initial={editInitial}
                    onCancel={() => setIsEditingEventDetails(false)}
                    onSaved={() => setIsEditingEventDetails(false)}
                  />
                  <EventDisplayCard
                    role={roleLabel}
                    dateRangeLabel={display.dateRangeLabel}
                    location={display.location}
                    generalInformation={splitGeneral.publicMarkdown || null}
                    showDetailsPanel={false}
                    showGeneralInformationPanel
                  />
                </>
              ) : editable && isEditingGeneralInformation ? (
                <>
                  <EventDisplayCard
                    role={roleLabel}
                    dateRangeLabel={display.dateRangeLabel}
                    location={display.location}
                    generalInformation={splitGeneral.publicMarkdown || null}
                    onEditEventDetails={() => {
                      setIsEditingGeneralInformation(false);
                      setIsEditingEventDetails(true);
                    }}
                    showGeneralInformationPanel={false}
                  />
                  <EditGeneralInformationForm
                    key={eventId}
                    eventId={eventId}
                    initialMarkdown={display.generalInformation ?? null}
                    onCancel={() => setIsEditingGeneralInformation(false)}
                    onSaved={() => setIsEditingGeneralInformation(false)}
                  />
                </>
              ) : (
                <>
                  <EventDisplayCard
                    role={roleLabel}
                    dateRangeLabel={display.dateRangeLabel}
                    location={display.location}
                    generalInformation={splitGeneral.publicMarkdown || null}
                    onEditEventDetails={
                      editable
                        ? () => setIsEditingEventDetails(true)
                        : undefined
                    }
                    onEditGeneralInformation={
                      editable
                        ? () => setIsEditingGeneralInformation(true)
                        : undefined
                    }
                  />
                  {editable && splitGeneral.editingMarkdown ? (
                    <section
                      aria-label="Editing event info"
                      className="w-full rounded-lg border border-amber-200 bg-amber-50/70 p-6 shadow dark:border-amber-900/60 dark:bg-amber-950/20"
                    >
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                        Editing event info
                      </p>
                      <GeneralInformationMarkdown
                        markdown={splitGeneral.editingMarkdown}
                      />
                    </section>
                  ) : null}
                </>
              )}
            </>
          )}

          {tab === "packing" && showPackingTab && (
            <PackingSection
              eventId={eventId}
              canManagePacking={packing.canManagePacking}
              liveblocksRoomId={packing.liveblocksRoomId}
              commitments={packing.commitments}
              packingListPath={packing.packingListPath}
            />
          )}

          {tab === "tasks" && settings.taskBoardEnabled && (
            <TaskBoard
              eventId={eventId}
              currentUserId={currentUserId}
              members={membersInitial.map((m) => ({
                membershipId: m.membershipId,
                userId: m.userId,
                name: m.name,
                email: m.email,
              }))}
            />
          )}

          {tab === "members" && (
            <MembersSection
              eventId={eventId}
              createdById={createdById}
              currentUserId={currentUserId}
              actorRole={actorRole}
              memberManagementPolicy={settings.memberManagementPolicy}
              initialMembers={membersInitial}
            />
          )}

          {tab === "rides" && settings.ridesEnabled && (
            <RidesBoard
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

      <Chat eventId={eventId} />
    </div>
  );
}
