import { randomBytes } from "crypto";
import { PackingListVisibility } from "@prisma/client";
import { emitPackingPersistNotifications } from "@/lib/packing-notifications";
import { prisma } from "@/lib/prisma";
import { itemQuantityCap } from "@/lib/packing-quantity";

export type PackingSignUpPayload = {
  id: string;
  quantity: number | null;
  displayName: string;
  email: string | null;
  userId: string | null;
  packed: boolean;
};

export type PackingSectionPayload = {
  id: string;
  title: string;
};

export type PackingItemPayload = {
  id: string;
  /** Named section id, or null for Uncategorized. */
  sectionId: string | null;
  name: string;
  quantity: number | null;
  /** Upper inclusive bound; null/omit with quantity set = need exactly `quantity`. */
  quantityMax?: number | null;
  signUps: PackingSignUpPayload[];
};

/** Full collaborative list shape synced to Postgres. */
export type PackingListSyncPayload = {
  sections: PackingSectionPayload[];
  items: PackingItemPayload[];
};

/** Who is persisting: organizers apply the full payload; others may only change their own sign-ups. */
export type PackingPersistActor =
  | { kind: "organizer"; userId: string }
  | { kind: "participant"; userId: string }
  | { kind: "guest"; displayName: string };

type DbItemForMerge = {
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
};

type DbSectionForMerge = {
  id: string;
  title: string;
};

type TemplateSlice = {
  id: string;
  sectionId: string | null;
  name: string;
  quantity: number | null;
  quantityMax: number | null;
};

function effectiveQuantityMax(
  quantity: number | null,
  quantityMax: number | null | undefined,
): number | null {
  if (quantity == null) return null;
  if (quantityMax != null && quantityMax > quantity) return quantityMax;
  return null;
}

function templateFromPayload(it: PackingItemPayload): TemplateSlice {
  return {
    id: it.id,
    sectionId: it.sectionId,
    name: it.name.trim(),
    quantity: it.quantity,
    quantityMax: effectiveQuantityMax(it.quantity, it.quantityMax ?? null),
  };
}

function templateFromDbRow(row: DbItemForMerge): TemplateSlice {
  return {
    id: row.id,
    sectionId: row.sectionId,
    name: row.name.trim(),
    quantity: row.quantity,
    quantityMax: effectiveQuantityMax(row.quantity, row.quantityMax),
  };
}

function templatesEqual(a: TemplateSlice, b: TemplateSlice): boolean {
  return (
    a.id === b.id &&
    a.sectionId === b.sectionId &&
    a.name === b.name &&
    a.quantity === b.quantity &&
    a.quantityMax === b.quantityMax
  );
}

function normalizeSectionTitle(raw: string): string {
  return raw.trim();
}

function sectionsStructureEqual(
  db: DbSectionForMerge[],
  incoming: PackingSectionPayload[],
): boolean {
  if (db.length !== incoming.length) return false;
  for (let i = 0; i < db.length; i++) {
    const a = db[i]!;
    const b = incoming[i]!;
    if (a.id !== b.id) return false;
    if (normalizeSectionTitle(a.title) !== normalizeSectionTitle(b.title)) {
      return false;
    }
  }
  return true;
}

function dbSignUpToPayload(
  s: DbItemForMerge["signUps"][0],
): PackingSignUpPayload {
  return {
    id: s.id,
    quantity: s.quantity,
    displayName: s.displayName,
    email: s.email,
    userId: s.userId,
    packed: s.packed,
  };
}

function ownsSignUpDb(
  su: PackingSignUpPayload,
  actor: PackingPersistActor,
): boolean {
  if (actor.kind === "participant") {
    return su.userId === actor.userId;
  }
  if (actor.kind === "guest") {
    return !su.userId && su.displayName.trim() === actor.displayName.trim();
  }
  return false;
}

/** Participant may remove their own sign-up or any linked event member’s row. */
function participantMayRemoveDbSignUp(
  dbRow: PackingSignUpPayload,
  actor: Extract<PackingPersistActor, { kind: "participant" }>,
  eventMemberUserIds: ReadonlySet<string>,
): boolean {
  if (ownsSignUpDb(dbRow, actor)) return true;
  const uid = dbRow.userId?.trim();
  if (!uid) return false;
  return eventMemberUserIds.has(uid);
}

/** Participant may add their own sign-up or a new row for another event member. */
function participantMayAddNewSignUp(
  inc: PackingSignUpPayload,
  actor: Extract<PackingPersistActor, { kind: "participant" }>,
  eventMemberUserIds: ReadonlySet<string>,
): boolean {
  if (ownsSignUpDb(inc, actor)) return true;
  const uid = inc.userId?.trim();
  if (!uid) return false;
  return eventMemberUserIds.has(uid);
}

/** Participant may change quantity on another member’s linked sign-up (identity + packed stay server-truth). */
function participantMayAdjustOtherMemberSignUpQuantity(
  dbRow: PackingSignUpPayload,
  actor: Extract<PackingPersistActor, { kind: "participant" }>,
  eventMemberUserIds: ReadonlySet<string>,
): boolean {
  if (ownsSignUpDb(dbRow, actor)) return false;
  const uid = dbRow.userId?.trim();
  if (!uid) return false;
  return eventMemberUserIds.has(uid);
}

function mergeSignUpsForActor(
  dbSignUps: PackingSignUpPayload[],
  incSignUps: PackingSignUpPayload[],
  actor: Extract<PackingPersistActor, { kind: "participant" | "guest" }>,
  eventMemberUserIds: ReadonlySet<string>,
): PackingSignUpPayload[] {
  const memberIdsForParticipant =
    actor.kind === "participant" ? eventMemberUserIds : new Set<string>();
  const dbById = new Map(dbSignUps.map((s) => [s.id, s]));
  const incById = new Map(incSignUps.map((s) => [s.id, s]));
  const merged: PackingSignUpPayload[] = [];
  const usedInc = new Set<string>();

  for (const dbRow of dbSignUps) {
    const inc = incById.get(dbRow.id);
    if (!inc) {
      if (
        actor.kind === "participant" &&
        participantMayRemoveDbSignUp(dbRow, actor, memberIdsForParticipant)
      ) {
        continue;
      }
      if (actor.kind === "guest" && ownsSignUpDb(dbRow, actor)) continue;
      merged.push(dbRow);
      continue;
    }
    usedInc.add(dbRow.id);
    if (ownsSignUpDb(dbRow, actor)) {
      merged.push(inc);
    } else if (
      actor.kind === "participant" &&
      participantMayAdjustOtherMemberSignUpQuantity(
        dbRow,
        actor,
        memberIdsForParticipant,
      )
    ) {
      merged.push({
        ...dbRow,
        quantity: inc.quantity,
      });
    } else {
      merged.push(dbRow);
    }
  }

  for (const inc of incSignUps) {
    if (usedInc.has(inc.id)) continue;
    if (dbById.has(inc.id)) continue;
    if (actor.kind === "guest") {
      if (ownsSignUpDb(inc, actor)) merged.push(inc);
    } else if (
      participantMayAddNewSignUp(inc, actor, memberIdsForParticipant)
    ) {
      merged.push(inc);
    }
  }

  return merged;
}

export type MergeParticipantPackingOptions = {
  /** Event member user ids (packing list’s event). Used so participants can add/remove other members’ sign-ups. */
  eventMemberUserIds?: ReadonlySet<string>;
};

/**
 * Non-organizers may change their own sign-ups and (when `eventMemberUserIds` is provided) add, remove,
 * or change quantity on sign-ups linked to other event members; shared template must match the database row-for-row.
 */
export function mergeParticipantPackingPayload(
  dbSectionsOrdered: DbSectionForMerge[],
  dbItemsOrdered: DbItemForMerge[],
  incoming: PackingListSyncPayload,
  actor: Extract<PackingPersistActor, { kind: "participant" | "guest" }>,
  options: MergeParticipantPackingOptions = {},
):
  | { ok: true; sections: PackingSectionPayload[]; items: PackingItemPayload[] }
  | { ok: false; error: string } {
  const eventMemberUserIds = options.eventMemberUserIds ?? new Set<string>();
  const incSections = incoming.sections ?? [];
  const incItems = incoming.items ?? [];
  if (!sectionsStructureEqual(dbSectionsOrdered, incSections)) {
    return {
      ok: false,
      error: "Only organizers can change the shared list structure",
    };
  }
  if (incItems.length !== dbItemsOrdered.length) {
    return {
      ok: false,
      error: "Only organizers can change the shared list structure",
    };
  }
  const out: PackingItemPayload[] = [];
  for (let i = 0; i < dbItemsOrdered.length; i++) {
    const dbRow = dbItemsOrdered[i]!;
    const inc = incItems[i]!;
    if (dbRow.id !== inc.id) {
      return {
        ok: false,
        error: "Only organizers can change the shared list structure",
      };
    }
    const dbT = templateFromDbRow(dbRow);
    const incT = templateFromPayload(inc);
    if (!templatesEqual(dbT, incT)) {
      return {
        ok: false,
        error: "Only organizers can change the shared list structure",
      };
    }
    const dbS = dbRow.signUps.map(dbSignUpToPayload);
    const merged = mergeSignUpsForActor(
      dbS,
      inc.signUps,
      actor,
      eventMemberUserIds,
    );
    out.push({
      id: dbRow.id,
      sectionId: dbRow.sectionId,
      name: dbRow.name,
      quantity: dbRow.quantity,
      quantityMax: dbRow.quantityMax,
      signUps: merged,
    });
  }
  return {
    ok: true,
    sections: incSections.map((s) => ({
      id: s.id,
      title: normalizeSectionTitle(s.title),
    })),
    items: out,
  };
}

const MAX_ITEMS = 500;
const MAX_SIGN_UPS_PER_ITEM = 40;
export const MAX_SECTION_LEN = 120;
/** Cap for `PackingSection` rows per list; mirror in `MAX_PACKING_SECTIONS` (PackingListEditor). */
const MAX_SECTIONS = 100;

function generateLiveblocksRoomId(): string {
  return randomBytes(24).toString("base64url");
}

export function normalizeEmailForSignUp(email: string): string {
  return email.trim().toLowerCase();
}

const signUpsInclude = {
  orderBy: { sortOrder: "asc" as const },
};

const sectionsInclude = {
  orderBy: { sortOrder: "asc" as const },
};

/** Lightweight access check before loading full list payloads (e.g. members-only lists). */
export async function getPackingListEventAccessByRoomId(roomId: string) {
  const row = await prisma.packingList.findUnique({
    where: { liveblocksRoomId: roomId },
    select: {
      eventId: true,
      event: { select: { id: true, packingListVisibility: true } },
    },
  });
  if (!row) return null;
  return {
    eventId: row.eventId,
    packingListVisibility: row.event.packingListVisibility,
  };
}

export async function getPackingListByRoomId(roomId: string) {
  return prisma.packingList.findUnique({
    where: { liveblocksRoomId: roomId },
    include: {
      event: {
        select: { id: true, title: true, packingListVisibility: true },
      },
      sections: sectionsInclude,
      items: {
        orderBy: { sortOrder: "asc" },
        include: { signUps: signUpsInclude },
      },
    },
  });
}

export async function getPackingListForEvent(eventId: string) {
  return prisma.packingList.findUnique({
    where: { eventId },
    include: {
      sections: sectionsInclude,
      items: {
        orderBy: { sortOrder: "asc" },
        include: { signUps: signUpsInclude },
      },
    },
  });
}

/** Rows where the given Rendecrew user has a packing-list sign-up (linked `userId`). */
export type PackingCommitmentForUser = {
  signUpId: string;
  itemId: string;
  itemName: string;
  itemQuantity: number | null;
  signUpQuantity: number | null;
  signUpPacked: boolean;
};

export function listPackingCommitmentsForUser(
  packingList: {
    items: Array<{
      id: string;
      name: string;
      quantity: number | null;
      quantityMax: number | null;
      signUps: Array<{
        id: string;
        userId: string | null;
        quantity: number | null;
        packed: boolean;
      }>;
    }>;
  },
  userId: string,
): PackingCommitmentForUser[] {
  const out: PackingCommitmentForUser[] = [];
  for (const item of packingList.items) {
    for (const su of item.signUps) {
      if (su.userId === userId) {
        out.push({
          signUpId: su.id,
          itemId: item.id,
          itemName: item.name,
          itemQuantity: item.quantity,
          signUpQuantity: su.quantity,
          signUpPacked: su.packed,
        });
      }
    }
  }
  return out;
}

/** Use the Prisma transaction client when calling from `prisma.$transaction` so create + related updates are atomic. */
export type PackingListDb = { packingList: typeof prisma.packingList };

export async function createPackingListForEvent(
  eventId: string,
  db: PackingListDb = prisma,
) {
  const existing = await db.packingList.findUnique({
    where: { eventId },
  });
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const liveblocksRoomId = generateLiveblocksRoomId();
    try {
      return await db.packingList.create({
        data: { eventId, liveblocksRoomId },
      });
    } catch {
      // unique collision on liveblocksRoomId — retry
    }
  }
  throw new Error("Could not allocate a unique packing list room id");
}

/**
 * Links packing sign-ups to this user when they used the same email before creating a Rendecrew account.
 */
export async function backfillPackingItemSignUpsForUser(
  userId: string,
  email: string,
): Promise<void> {
  const normalized = normalizeEmailForSignUp(email);
  if (!normalized) return;

  await prisma.packingItemSignUp.updateMany({
    where: {
      userId: null,
      email: { equals: normalized, mode: "insensitive" },
    },
    data: { userId },
  });
}

function sumSignUpQuantities(signUps: { quantity: number | null }[]): number {
  return signUps.reduce(
    (acc, s) => acc + (typeof s.quantity === "number" ? s.quantity : 0),
    0,
  );
}

function normalizePersistPayload(
  payload: PackingListSyncPayload | PackingItemPayload[],
): PackingListSyncPayload {
  if (Array.isArray(payload)) {
    return { sections: [], items: payload };
  }
  return {
    sections: Array.isArray(payload.sections) ? payload.sections : [],
    items: Array.isArray(payload.items) ? payload.items : [],
  };
}

export async function persistPackingListItems(
  liveblocksRoomId: string,
  payload: PackingListSyncPayload | PackingItemPayload[],
  actor: PackingPersistActor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { sections: sectionsIn, items: itemsIn } =
    normalizePersistPayload(payload);
  const list = await prisma.packingList.findUnique({
    where: { liveblocksRoomId },
    select: {
      id: true,
      eventId: true,
      event: { select: { packingListVisibility: true } },
      sections: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, title: true },
      },
      items: {
        orderBy: { sortOrder: "asc" },
        include: { signUps: signUpsInclude },
      },
    },
  });
  if (!list) {
    return { ok: false, error: "Packing list not found" };
  }

  if (list.event.packingListVisibility === PackingListVisibility.MEMBERS_ONLY) {
    if (actor.kind === "guest") {
      return {
        ok: false,
        error:
          "This packing list is only available to signed-in event members.",
      };
    }
    const userId =
      actor.kind === "organizer" || actor.kind === "participant"
        ? actor.userId
        : null;
    if (!userId) {
      return { ok: false, error: "Not authorized to sync this packing list." };
    }
    const membership = await prisma.eventMember.findUnique({
      where: {
        eventId_userId: { eventId: list.eventId, userId },
      },
      select: { id: true },
    });
    if (!membership) {
      return {
        ok: false,
        error: "You do not have access to this event packing list.",
      };
    }
  }

  let sectionsToPersist = sectionsIn;
  let itemsToPersist = itemsIn;
  if (actor.kind !== "organizer") {
    const memberRows = await prisma.eventMember.findMany({
      where: { eventId: list.eventId },
      select: { userId: true },
    });
    const eventMemberUserIds = new Set(memberRows.map((m) => m.userId));
    const merged = mergeParticipantPackingPayload(
      list.sections as DbSectionForMerge[],
      list.items as DbItemForMerge[],
      { sections: sectionsIn, items: itemsIn },
      actor,
      { eventMemberUserIds },
    );
    if (!merged.ok) return merged;
    sectionsToPersist = merged.sections;
    itemsToPersist = merged.items;
  }

  if (!Array.isArray(sectionsToPersist)) {
    return { ok: false, error: "Invalid sections" };
  }
  if (sectionsToPersist.length > MAX_SECTIONS) {
    return { ok: false, error: "Too many sections" };
  }

  const seenSectionIds = new Set<string>();
  for (const sec of sectionsToPersist) {
    if (!sec.id || typeof sec.id !== "string") {
      return { ok: false, error: "Invalid section id" };
    }
    if (seenSectionIds.has(sec.id)) {
      return { ok: false, error: "Duplicate section id" };
    }
    seenSectionIds.add(sec.id);
    const t = normalizeSectionTitle(sec.title ?? "");
    if (!t || t.length > MAX_SECTION_LEN) {
      return { ok: false, error: "Invalid section title" };
    }
  }

  const sectionIdSet = new Set(sectionsToPersist.map((s) => s.id));

  if (itemsToPersist.length > MAX_ITEMS) {
    return { ok: false, error: "Too many items" };
  }

  for (const it of itemsToPersist) {
    if (!it.id || typeof it.id !== "string") {
      return { ok: false, error: "Invalid item id" };
    }
    const name = it.name?.trim() ?? "";
    if (!name || name.length > 200) {
      return { ok: false, error: "Invalid item name" };
    }
    if (it.sectionId != null) {
      if (typeof it.sectionId !== "string" || !sectionIdSet.has(it.sectionId)) {
        return { ok: false, error: "Invalid item section" };
      }
    }
    if (
      it.quantity != null &&
      (!Number.isInteger(it.quantity) || it.quantity < 0)
    ) {
      return { ok: false, error: "Invalid quantity" };
    }
    const qMaxRaw = it.quantityMax;
    if (qMaxRaw != null) {
      if (it.quantity == null) {
        return { ok: false, error: "Quantity max requires a minimum quantity" };
      }
      if (!Number.isInteger(qMaxRaw) || qMaxRaw < 0) {
        return { ok: false, error: "Invalid quantity max" };
      }
      if (qMaxRaw < it.quantity) {
        return {
          ok: false,
          error: "Quantity max must be at least the minimum",
        };
      }
    }
    const cap = itemQuantityCap(it.quantity, qMaxRaw ?? null);
    if (
      !Array.isArray(it.signUps) ||
      it.signUps.length > MAX_SIGN_UPS_PER_ITEM
    ) {
      return { ok: false, error: "Invalid sign-ups" };
    }

    const seenUser = new Set<string>();
    for (const su of it.signUps) {
      if (!su.id || typeof su.id !== "string") {
        return { ok: false, error: "Invalid sign-up id" };
      }
      const dn = su.displayName?.trim() ?? "";
      if (!dn || dn.length > 120) {
        return { ok: false, error: "Invalid sign-up name" };
      }
      if (su.quantity != null) {
        if (!Number.isInteger(su.quantity) || su.quantity < 1) {
          return { ok: false, error: "Invalid quantity for sign-up" };
        }
        if (cap != null && su.quantity != null && su.quantity > cap) {
          return { ok: false, error: "Sign-up exceeds quantity needed" };
        }
      }
      if (it.quantity != null && su.quantity == null) {
        return {
          ok: false,
          error: "Sign-up needs a quantity when item has a total",
        };
      }
      if (su.userId?.trim()) {
        const uid = su.userId.trim();
        if (seenUser.has(uid)) {
          return {
            ok: false,
            error: "Duplicate sign-up for same user on an item",
          };
        }
        seenUser.add(uid);
      }
      const em = su.email?.trim();
      if (em && em.length > 254) {
        return { ok: false, error: "Invalid email on sign-up" };
      }
      if (typeof su.packed !== "boolean") {
        return { ok: false, error: "Invalid packed flag on sign-up" };
      }
    }

    if (cap != null) {
      const sum = sumSignUpQuantities(it.signUps);
      if (sum > cap) {
        return { ok: false, error: "Sign-ups exceed total quantity needed" };
      }
    }
  }

  const userIds = new Set(
    itemsToPersist.flatMap((i) =>
      i.signUps
        .map((s) => s.userId)
        .filter((x): x is string => Boolean(x?.trim())),
    ),
  );
  for (const uid of userIds) {
    const member = await prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId: list.eventId, userId: uid } },
      select: { userId: true },
    });
    if (!member) {
      return {
        ok: false,
        error: "Sign-up user must be an event member",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const incomingIds = itemsToPersist.map((i) => i.id);
      const touched = await tx.packingItem.findMany({
        where: { id: { in: incomingIds } },
        select: { id: true, packingListId: true },
      });
      for (const row of touched) {
        if (row.packingListId !== list.id) {
          throw new Error("Invalid item reference");
        }
      }

      const existing = await tx.packingItem.findMany({
        where: { packingListId: list.id },
        select: { id: true },
      });
      const incomingSet = new Set(incomingIds);
      const toDelete = existing
        .filter((e) => !incomingSet.has(e.id))
        .map((e) => e.id);
      if (toDelete.length) {
        await tx.packingItem.deleteMany({
          where: { id: { in: toDelete }, packingListId: list.id },
        });
      }

      const incomingSectionIds = sectionsToPersist.map((s) => s.id);
      if (incomingSectionIds.length > 0) {
        await tx.packingSection.deleteMany({
          where: {
            packingListId: list.id,
            id: { notIn: incomingSectionIds },
          },
        });
      } else {
        await tx.packingSection.deleteMany({
          where: { packingListId: list.id },
        });
      }

      for (let i = 0; i < sectionsToPersist.length; i++) {
        const sec = sectionsToPersist[i]!;
        const title = normalizeSectionTitle(sec.title);
        await tx.packingSection.upsert({
          where: { id: sec.id },
          create: {
            id: sec.id,
            packingListId: list.id,
            title,
            sortOrder: i,
          },
          update: {
            title,
            sortOrder: i,
          },
        });
      }

      const signUpUserIdList = [...userIds];
      const signUpUsers =
        signUpUserIdList.length > 0
          ? await tx.user.findMany({
              where: { id: { in: signUpUserIdList } },
              select: { id: true, name: true, email: true },
            })
          : [];
      const signUpUserById = new Map(signUpUsers.map((u) => [u.id, u]));

      for (let i = 0; i < itemsToPersist.length; i++) {
        const it = itemsToPersist[i];

        const quantityMax =
          it.quantity != null &&
          it.quantityMax != null &&
          it.quantityMax > it.quantity
            ? it.quantityMax
            : null;

        await tx.packingItem.upsert({
          where: { id: it.id },
          create: {
            id: it.id,
            packingListId: list.id,
            section: null,
            sectionId: it.sectionId,
            name: it.name.trim(),
            quantity: it.quantity,
            quantityMax,
            sortOrder: i,
          },
          update: {
            section: null,
            sectionId: it.sectionId,
            name: it.name.trim(),
            quantity: it.quantity,
            quantityMax,
            sortOrder: i,
          },
        });

        const priorPacked = await tx.packingItemSignUp.findMany({
          where: { packingItemId: it.id },
          select: { id: true, packed: true },
        });
        const packedBySignUpId = new Map(
          priorPacked.map((r) => [r.id, r.packed]),
        );

        await tx.packingItemSignUp.deleteMany({
          where: { packingItemId: it.id },
        });

        if (it.signUps.length) {
          await tx.packingItemSignUp.createMany({
            data: it.signUps.map((su, j) => {
              const uidTrim = su.userId?.trim() || null;
              const fromUser = uidTrim
                ? signUpUserById.get(uidTrim)
                : undefined;
              const dnFromUser = fromUser?.name?.trim() ?? "";
              const displayName =
                uidTrim && dnFromUser ? dnFromUser : su.displayName.trim();
              const emailResolved =
                uidTrim && fromUser?.email?.trim()
                  ? normalizeEmailForSignUp(fromUser.email)
                  : su.email?.trim() != null && su.email.trim() !== ""
                    ? normalizeEmailForSignUp(su.email)
                    : null;
              return {
                id: su.id,
                packingItemId: it.id,
                quantity: su.quantity,
                packed: packedBySignUpId.get(su.id) ?? su.packed,
                displayName,
                email: emailResolved,
                userId: uidTrim,
                sortOrder: j,
              };
            }),
          });
        }
      }
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to save packing list";
    return { ok: false, error: message };
  }

  const actorUserId = actor.kind === "guest" ? null : (actor.userId as string);
  await emitPackingPersistNotifications({
    eventId: list.eventId,
    packingListId: list.id,
    dbItemsBefore: list.items as Array<{
      id: string;
      name: string;
      signUps: Array<{
        id: string;
        quantity: number | null;
        userId: string | null;
      }>;
    }>,
    itemsAfter: itemsToPersist,
    actorUserId,
  });

  return { ok: true };
}
