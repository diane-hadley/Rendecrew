import { PackingSuggestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  listPackingCommitmentsForUser,
  type PackingCommitmentForUser,
  type PackingItemPayload,
  type PackingSectionPayload,
} from "@/lib/packing-list";
import type { PersonalItemVM } from "@/lib/personal-packing-sections";

export type { PersonalItemVM };
export type PublishedSuggestionVM = {
  id: string;
  name: string;
  section: string | null;
  defaultQuantity: number | null;
  createdAt: string;
  isNew: boolean;
  alreadyCopied: boolean;
};

export type DraftSuggestionVM = {
  id: string;
  name: string;
  section: string | null;
  defaultQuantity: number | null;
  createdByName: string;
};

export type PackingSignupMemberOption = {
  userId: string;
  name: string;
};

export type PackingCollabAuthUser = {
  dbUserId: string;
  name: string;
  email: string;
};

export type PackingCollabPageData = {
  roomId: string;
  eventId: string;
  eventTitle: string;
  initialSections: PackingSectionPayload[];
  initialItems: PackingItemPayload[];
  authUser: PackingCollabAuthUser | null;
  canManageTemplate: boolean;
  packingSignupMembers: readonly PackingSignupMemberOption[];
  suggestionApprovalRequired: boolean;
  publishedSuggestions: PublishedSuggestionVM[];
  draftSuggestions: DraftSuggestionVM[];
  personalItems: PersonalItemVM[];
  commitments: PackingCommitmentForUser[];
};

type ListForCollab = {
  liveblocksRoomId: string;
  eventId: string;
  sections: Array<{ id: string; title: string }>;
  items: Array<{
    id: string;
    sectionId: string | null;
    name: string;
    quantity: number | null;
    quantityMax: number | null;
    signUps: Array<{
      id: string;
      quantity: number | null;
      displayName: string;
      email: string | null;
      userId: string | null;
      packed: boolean;
    }>;
  }>;
};

export async function buildPackingCollabPageData({
  list,
  eventTitle,
  authUser,
  canManageTemplate,
  packingSignupMembers,
  suggestionApprovalRequired,
}: {
  list: ListForCollab;
  eventTitle: string;
  authUser: PackingCollabAuthUser | null;
  canManageTemplate: boolean;
  packingSignupMembers: readonly PackingSignupMemberOption[];
  suggestionApprovalRequired: boolean;
}): Promise<PackingCollabPageData> {
  const eventId = list.eventId;

  const published = await prisma.packingSuggestion.findMany({
    where: { eventId, status: PackingSuggestionStatus.PUBLISHED },
    orderBy: [{ section: "asc" }, { name: "asc" }],
  });

  let lastSeen: Date | null = null;
  const personalSourceIds = new Set<string>();
  let personalItems: PersonalItemVM[] = [];

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
        sortOrder: true,
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

  const publishedSuggestions: PublishedSuggestionVM[] = published.map((p) => ({
    id: p.id,
    name: p.name,
    section: p.section,
    defaultQuantity: p.defaultQuantity,
    createdAt: p.createdAt.toISOString(),
    isNew: lastSeen != null ? p.createdAt > lastSeen : true,
    alreadyCopied: personalSourceIds.has(p.id),
  }));

  let draftSuggestions: DraftSuggestionVM[] = [];
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

  const commitments: PackingCommitmentForUser[] = authUser
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

  return {
    roomId: list.liveblocksRoomId,
    eventId,
    eventTitle,
    initialSections,
    initialItems,
    authUser,
    canManageTemplate,
    packingSignupMembers,
    suggestionApprovalRequired,
    publishedSuggestions,
    draftSuggestions,
    personalItems,
    commitments,
  };
}
