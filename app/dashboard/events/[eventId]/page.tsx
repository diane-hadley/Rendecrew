import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { EventDetailClient } from "@/components/events/EventDetailClient";
import { canManageEvent, getEventForUser } from "@/lib/events";
import {
  getPackingListForEvent,
  listPackingCommitmentsForUser,
} from "@/lib/packing-list";
import { getOrCreateUser } from "@/lib/user";

function formatRange(start: Date | null, end: Date | null) {
  if (!start || !end) {
    return "No date set";
  }
  const opts: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };
  return `${start.toLocaleString(undefined, opts)} – ${end.toLocaleString(undefined, opts)}`;
}

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

  const dateRangeLabel = formatRange(event.startAt, event.endAt);

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              ← Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Event</h1>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>

        <EventDetailClient
          eventId={event.id}
          editable={editable}
          role={role}
          display={{
            title: event.title,
            description: event.description,
            location: event.location,
            dateRangeLabel,
          }}
          editInitial={{
            title: event.title,
            description: event.description,
            location: event.location,
            startAt: event.startAt,
            endAt: event.endAt,
          }}
          packing={{
            canManagePacking: editable,
            liveblocksRoomId: packingList?.liveblocksRoomId ?? null,
            commitments: myPackingCommitments,
            packingListPath,
          }}
        />
      </div>
    </div>
  );
}
