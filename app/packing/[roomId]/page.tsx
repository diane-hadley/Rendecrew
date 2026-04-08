import { PackingSuggestionStatus } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackingCollabPage } from "@/components/packing/PackingCollabPage";
import { canManageEvent, getEventForUser } from "@/lib/events";
import {
  getPackingListByRoomId,
  listPackingCommitmentsForUser,
  type PackingItemPayload,
  type PackingSectionPayload,
} from "@/lib/packing-list";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

export default async function PublicPackingPage({
  params,
}: {
  params: { roomId: string };
}) {
  const list = await getPackingListByRoomId(params.roomId);
  if (!list) {
    notFound();
  }

  const clerkUser = await currentUser();
  let authUser: { dbUserId: string; name: string; email: string } | null = null;
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
  if (authUser) {
    const row = await getEventForUser(eventId, authUser.dbUserId);
    canManageTemplate = row != null && canManageEvent(row.role);
  }

  const published = await prisma.packingSuggestion.findMany({
    where: { eventId, status: PackingSuggestionStatus.PUBLISHED },
    orderBy: [{ section: "asc" }, { name: "asc" }],
  });

  let lastSeen: Date | null = null;
  const personalSourceIds = new Set<string>();
  let personalItems: Array<{
    id: string;
    name: string;
    section: string | null;
    quantity: number;
    packed: boolean;
  }> = [];

  if (authUser) {
    const st = await prisma.userSuggestionState.findUnique({
      where: {
        userId_eventId: { userId: authUser.dbUserId, eventId },
      },
    });
    lastSeen = st?.lastSeenSuggestionCatalogAt ?? null;

    const rows = await prisma.personalPackingItem.findMany({
      where: { eventId, userId: authUser.dbUserId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        section: true,
        quantity: true,
        packed: true,
        sourceSuggestionId: true,
      },
    });
    personalItems = rows.map(({ sourceSuggestionId: _sid, ...rest }) => rest);
    for (const r of rows) {
      if (r.sourceSuggestionId) {
        personalSourceIds.add(r.sourceSuggestionId);
      }
    }
  }

  const publishedSuggestions = published.map((p) => ({
    id: p.id,
    name: p.name,
    section: p.section,
    defaultQuantity: p.defaultQuantity,
    createdAt: p.createdAt.toISOString(),
    isNew: lastSeen != null ? p.createdAt > lastSeen : true,
    alreadyCopied: personalSourceIds.has(p.id),
  }));

  let draftSuggestions: Array<{
    id: string;
    name: string;
    section: string | null;
    defaultQuantity: number | null;
    createdByName: string;
  }> = [];
  if (canManageTemplate) {
    const ds = await prisma.packingSuggestion.findMany({
      where: { eventId, status: PackingSuggestionStatus.DRAFT_USER },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
    });
    draftSuggestions = ds.map((d) => ({
      id: d.id,
      name: d.name,
      section: d.section,
      defaultQuantity: d.defaultQuantity,
      createdByName: d.createdBy.name,
    }));
  }

  const commitments = authUser
    ? listPackingCommitmentsForUser(
        {
          items: list.items.map((it) => ({
            id: it.id,
            name: it.name,
            quantity: it.quantity,
            quantityMax: it.quantityMax,
            signUps: it.signUps.map((s) => ({
              id: s.id,
              userId: s.userId,
              quantity: s.quantity,
              packed: s.packed,
            })),
          })),
        },
        authUser.dbUserId,
      )
    : [];

  const initialSections: PackingSectionPayload[] = list.sections.map((s) => ({
    id: s.id,
    title: s.title,
  }));

  const initialItems: PackingItemPayload[] = list.items.map((it) => ({
    id: it.id,
    sectionId: it.sectionId,
    name: it.name,
    quantity: it.quantity,
    quantityMax: it.quantityMax,
    signUps: it.signUps.map((s) => ({
      id: s.id,
      quantity: s.quantity,
      displayName: s.displayName,
      email: s.email,
      userId: s.userId,
      packed: s.packed,
    })),
  }));

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
            Shared packing list (no account required)
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
        <PackingCollabPage
          roomId={list.liveblocksRoomId}
          eventId={eventId}
          eventTitle={list.event.title}
          initialSections={initialSections}
          initialItems={initialItems}
          authUser={authUser}
          canManageTemplate={canManageTemplate}
          suggestionApprovalRequired={suggestionApprovalRequired}
          publishedSuggestions={publishedSuggestions}
          draftSuggestions={draftSuggestions}
          personalItems={personalItems}
          commitments={commitments}
        />
      </div>
    </div>
  );
}
