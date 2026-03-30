import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { DeleteEventPanel } from "@/components/DeleteEventPanel";
import { EditEventForm } from "@/components/EditEventForm";
import { MyEventPackingCommitments } from "@/components/MyEventPackingCommitments";
import { PackingListEventPanel } from "@/components/PackingListEventPanel";
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

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
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

        {editable ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You can edit this event as{" "}
              <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">
                {role}
              </span>
              .
            </p>
            <EditEventForm
              eventId={event.id}
              initial={{
                title: event.title,
                description: event.description,
                location: event.location,
                startAt: event.startAt,
                endAt: event.endAt,
              }}
            />
            <PackingListEventPanel
              eventId={event.id}
              liveblocksRoomId={packingList?.liveblocksRoomId ?? null}
            />
            <MyEventPackingCommitments
              eventId={event.id}
              commitments={myPackingCommitments}
              packingListPath={packingListPath}
            />
            <DeleteEventPanel eventId={event.id} eventTitle={event.title} />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-xl">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
              <h2 className="text-2xl font-semibold">{event.title}</h2>
              <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:text-gray-200 capitalize">
                {role}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {formatRange(event.startAt, event.endAt)}
            </p>
            {event.location && (
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                {event.location}
              </p>
            )}
            {event.description && (
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {event.description}
              </p>
            )}
            {packingList && (
              <div className="mt-6">
                <MyEventPackingCommitments
                  eventId={event.id}
                  commitments={myPackingCommitments}
                  packingListPath={packingListPath}
                />
              </div>
            )}
            <Link
              href="/dashboard"
              className="inline-block mt-6 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Back to dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
