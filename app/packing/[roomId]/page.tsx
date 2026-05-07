import { PackingListVisibility } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PackingCollabPage } from "@/components/packing/PackingCollabPage";
import { canManageEvent, getEventForUser } from "@/lib/events";
import {
  getPackingListByRoomId,
  getPackingListEventAccessByRoomId,
} from "@/lib/packing-list";
import { prisma } from "@/lib/prisma";
import {
  buildPackingCollabPageData,
  type PackingCollabAuthUser,
} from "@/lib/packing-collab-page-data";
import { getOrCreateUser } from "@/lib/user";

export default async function PublicPackingPage({
  params,
}: {
  params: { roomId: string };
}) {
  const access = await getPackingListEventAccessByRoomId(params.roomId);
  if (!access) {
    notFound();
  }

  if (access.packingListVisibility === PackingListVisibility.MEMBERS_ONLY) {
    const clerkUser = await currentUser();
    if (!clerkUser) {
      redirect(
        `/sign-in?redirect_url=${encodeURIComponent(`/packing/${params.roomId}`)}`,
      );
    }
    const dbUser = await getOrCreateUser();
    const row = await getEventForUser(access.eventId, dbUser.id);
    if (!row) {
      redirect("/dashboard");
    }
  }

  const list = await getPackingListByRoomId(params.roomId);
  if (!list) {
    notFound();
  }

  const clerkUser = await currentUser();
  let authUser: PackingCollabAuthUser | null = null;
  if (clerkUser) {
    try {
      const dbUser = await getOrCreateUser();
      authUser = {
        dbUserId: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
      };
    } catch {
      authUser = null;
    }
  }

  const eventId = list.event.id;

  const eventRow = await prisma.event.findUnique({
    where: { id: eventId },
    select: { suggestionApprovalRequired: true },
  });
  const suggestionApprovalRequired =
    eventRow?.suggestionApprovalRequired ?? false;

  let canManageTemplate = false;
  let packingSignupMembers: Array<{
    userId: string;
    name: string;
  }> = [];
  if (authUser) {
    const row = await getEventForUser(eventId, authUser.dbUserId);
    canManageTemplate = row != null && canManageEvent(row.role);
    if (row) {
      const memberRows = await prisma.eventMember.findMany({
        where: { eventId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { user: { name: "asc" } },
      });
      packingSignupMembers = memberRows.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
      }));
    }
  }

  const collab = await buildPackingCollabPageData({
    list: {
      liveblocksRoomId: list.liveblocksRoomId,
      eventId,
      sections: list.sections,
      items: list.items,
    },
    eventTitle: list.event.title,
    authUser,
    canManageTemplate,
    packingSignupMembers,
    suggestionApprovalRequired,
  });

  const membersOnlySubtitle =
    list.event.packingListVisibility === PackingListVisibility.MEMBERS_ONLY;

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <Link
              href="/"
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Rendecrew
            </Link>
            <span className="mx-2">·</span>
            {membersOnlySubtitle
              ? "Shared packing list (event members)"
              : "Shared packing list (no account required)"}
          </p>
          {!clerkUser && (
            <Link
              href="/sign-in"
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Sign in
            </Link>
          )}
        </div>
        <PackingCollabPage {...collab} />
      </div>
    </div>
  );
}
