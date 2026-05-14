import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import type { EventMemberListItem } from "@/lib/event-member-types";
import { EventDetailClient } from "@/components/events/EventDetailClient";
import { canDeleteEvent, canManageEvent, getEventForUser } from "@/lib/events";
import {
  getPackingListForEvent,
  listPackingCommitmentsForUser,
} from "@/lib/packing-list";
import { countDraftUserPackingSuggestionsForEvent } from "@/lib/packing-suggestion-queries";
import {
  buildPackingCollabPageData,
  type PackingCollabAuthUser,
  type PackingCollabPageData,
} from "@/lib/packing-collab-page-data";
import {
  formatEventDateRangeWithTimeZones,
  normalizeTimeZone,
} from "@/lib/event-datetime";
import { listEventMemberListItemsForEvent } from "@/lib/event-member-list";
import { getOrCreateUser } from "@/lib/user";

export default async function EventDetailPage({
  params,
}: {
  params: { eventId: string };
}) {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    redirect("/sign-in");
  }

  const dbUser = await getOrCreateUser();
  const row = await getEventForUser(params.eventId, dbUser.id);
  if (!row) {
    notFound();
  }

  const { event, role } = row;
  const editable = canManageEvent(role);
  const packingList = await getPackingListForEvent(event.id);
  const myPackingCommitments = packingList
    ? listPackingCommitmentsForUser(packingList, dbUser.id)
    : [];
  const packingListPath = packingList
    ? `/packing/${packingList.liveblocksRoomId}`
    : null;

  const pendingSuggestionDraftCount =
    editable && packingList
      ? await countDraftUserPackingSuggestionsForEvent(event.id)
      : 0;

  const dateRangeLabel = formatEventDateRangeWithTimeZones(
    event.startAt,
    event.endAt,
    event.startAtTimeZone,
    event.endAtTimeZone,
  );

  const membersInitial: EventMemberListItem[] =
    await listEventMemberListItemsForEvent(event.id);

  const isCreator = canDeleteEvent(dbUser.id, event);

  const eventHasScheduledRange = event.startAt != null && event.endAt != null;
  const ridesDefaultTimeZone = normalizeTimeZone(
    eventHasScheduledRange ? event.startAtTimeZone : dbUser.timezone,
    dbUser.timezone,
  );
  const tasksDefaultTimeZone = ridesDefaultTimeZone;

  const packingCollab: PackingCollabPageData | null = packingList
    ? await buildPackingCollabPageData({
        list: {
          liveblocksRoomId: packingList.liveblocksRoomId,
          eventId: event.id,
          sections: packingList.sections,
          items: packingList.items,
        },
        eventTitle: event.title,
        authUser: {
          dbUserId: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
        } satisfies PackingCollabAuthUser,
        canManageTemplate: editable,
        packingSignupMembers: membersInitial.map((m) => ({
          userId: m.userId,
          name: m.name,
        })),
        suggestionApprovalRequired: event.suggestionApprovalRequired ?? false,
      })
    : null;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-wrap items-center gap-4 lg:grid lg:grid-cols-[12rem_1fr] lg:items-center lg:gap-10">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          ← Dashboard
        </Link>
        <h1 className="text-3xl font-bold lg:col-start-2">{event.title}</h1>
      </div>

      <Suspense
        fallback={
          <div
            className="min-h-[12rem] animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
            aria-hidden
          />
        }
      >
        <EventDetailClient
          eventId={event.id}
          createdById={event.createdById}
          currentUserId={dbUser.id}
          actorRole={role}
          isCreator={isCreator}
          editable={editable}
          display={{
            title: event.title,
            generalInformation: event.generalInformation,
            location: event.location,
            dateRangeLabel,
          }}
          editInitial={{
            title: event.title,
            generalInformation: event.generalInformation,
            location: event.location,
            startAt: event.startAt,
            endAt: event.endAt,
            startAtTimeZone: event.startAtTimeZone,
            endAtTimeZone: event.endAtTimeZone,
          }}
          packing={{
            canManagePacking: editable,
            liveblocksRoomId: packingList?.liveblocksRoomId ?? null,
            commitments: myPackingCommitments,
            packingListPath,
            suggestionApprovalRequired:
              event.suggestionApprovalRequired ?? false,
            pendingSuggestionDraftCount,
            collab: packingCollab,
          }}
          settings={{
            memberManagementPolicy: event.memberManagementPolicy,
            packingListVisibility: event.packingListVisibility,
            packingEnabled: event.packingEnabled,
            suggestionApprovalRequired:
              event.suggestionApprovalRequired ?? false,
            ridesEnabled: event.ridesEnabled,
            taskBoardEnabled: event.taskBoardEnabled,
          }}
          ridesDefaultTimeZone={ridesDefaultTimeZone}
          tasksDefaultTimeZone={tasksDefaultTimeZone}
          membersInitial={membersInitial}
        />
      </Suspense>
    </div>
  );
}
