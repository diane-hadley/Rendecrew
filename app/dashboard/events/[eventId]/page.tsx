import { PackingSuggestionStatus } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { EventMemberListItem } from "@/app/actions/event-members";
import { EventDetailClient } from "@/components/events/EventDetailClient";
import { canDeleteEvent, canManageEvent, getEventForUser } from "@/lib/events";
import {
  getPackingListForEvent,
  listPackingCommitmentsForUser,
} from "@/lib/packing-list";
import { formatEventDateRangeWithTimeZone } from "@/lib/event-datetime";
import { prisma } from "@/lib/prisma";
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
      ? await prisma.packingSuggestion.count({
          where: {
            eventId: event.id,
            status: PackingSuggestionStatus.DRAFT_USER,
          },
        })
      : 0;

  const dateRangeLabel = formatEventDateRangeWithTimeZone(
    event.startAt,
    event.endAt,
    event.timezone,
  );

  const memberRows = await prisma.eventMember.findMany({
    where: { eventId: event.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const membersInitial: EventMemberListItem[] = memberRows.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
  }));

  const isCreator = canDeleteEvent(dbUser.id, event);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          ← Dashboard
        </Link>
        <h1 className="text-3xl font-bold">Event</h1>
      </div>

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
          timezone: event.timezone,
        }}
        packing={{
          canManagePacking: editable,
          liveblocksRoomId: packingList?.liveblocksRoomId ?? null,
          commitments: myPackingCommitments,
          packingListPath,
          suggestionApprovalRequired:
            event.suggestionApprovalRequired ?? false,
          pendingSuggestionDraftCount,
        }}
        settings={{
          memberManagementPolicy: event.memberManagementPolicy,
          packingListVisibility: event.packingListVisibility,
          suggestionApprovalRequired:
            event.suggestionApprovalRequired ?? false,
        }}
        membersInitial={membersInitial}
      />
    </div>
  );
}
