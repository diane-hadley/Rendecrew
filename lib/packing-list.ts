import { randomBytes } from "crypto";
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

export type PackingItemPayload = {
  id: string;
  /** Trimmed section label, or null/omitted for items above the first named section. */
  section?: string | null;
  name: string;
  quantity: number | null;
  /** Upper inclusive bound; null/omit with quantity set = need exactly `quantity`. */
  quantityMax?: number | null;
  signUps: PackingSignUpPayload[];
};

/** Who is persisting: organizers apply the full payload; others may only change their own sign-ups. */
export type PackingPersistActor =
  | { kind: "organizer" }
  | { kind: "participant"; userId: string }
  | { kind: "guest"; displayName: string };

type DbItemForMerge = {
  id: string;
  section: string | null;
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

type TemplateSlice = {
  id: string;
  section: string | null;
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
  const sectionRaw = it.section?.trim() ?? "";
  return {
    id: it.id,
    section: sectionRaw === "" ? null : sectionRaw,
    name: it.name.trim(),
    quantity: it.quantity,
    quantityMax: effectiveQuantityMax(it.quantity, it.quantityMax ?? null),
  };
}

function templateFromDbRow(row: DbItemForMerge): TemplateSlice {
  return {
    id: row.id,
    section: row.section,
    name: row.name.trim(),
    quantity: row.quantity,
    quantityMax: effectiveQuantityMax(row.quantity, row.quantityMax),
  };
}

function templatesEqual(a: TemplateSlice, b: TemplateSlice): boolean {
  return (
    a.id === b.id &&
    a.section === b.section &&
    a.name === b.name &&
    a.quantity === b.quantity &&
    a.quantityMax === b.quantityMax
  );
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

function mergeSignUpsForActor(
  dbSignUps: PackingSignUpPayload[],
  incSignUps: PackingSignUpPayload[],
  actor: Extract<PackingPersistActor, { kind: "participant" | "guest" }>,
): PackingSignUpPayload[] {
  const dbById = new Map(dbSignUps.map((s) => [s.id, s]));
  const incById = new Map(incSignUps.map((s) => [s.id, s]));
  const merged: PackingSignUpPayload[] = [];
  const usedInc = new Set<string>();

  for (const dbRow of dbSignUps) {
    const inc = incById.get(dbRow.id);
    if (!inc) {
      if (ownsSignUpDb(dbRow, actor)) continue;
      merged.push(dbRow);
      continue;
    }
    usedInc.add(dbRow.id);
    if (ownsSignUpDb(dbRow, actor)) merged.push(inc);
    else merged.push(dbRow);
  }

  for (const inc of incSignUps) {
    if (usedInc.has(inc.id)) continue;
    if (dbById.has(inc.id)) continue;
    if (ownsSignUpDb(inc, actor)) merged.push(inc);
  }

  return merged;
}

/**
 * Non-organizers may only change their own sign-ups; shared template must match the database row-for-row.
 */
export function mergeParticipantPackingPayload(
  dbItemsOrdered: DbItemForMerge[],
  incoming: PackingItemPayload[],
  actor: Extract<PackingPersistActor, { kind: "participant" | "guest" }>,
): { ok: true; items: PackingItemPayload[] } | { ok: false; error: string } {
  if (incoming.length !== dbItemsOrdered.length) {
    return {
      ok: false,
      error: "Only organizers can change the shared list structure",
    };
  }
  const out: PackingItemPayload[] = [];
  for (let i = 0; i < dbItemsOrdered.length; i++) {
    const dbRow = dbItemsOrdered[i]!;
    const inc = incoming[i]!;
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
    const merged = mergeSignUpsForActor(dbS, inc.signUps, actor);
    out.push({
      id: dbRow.id,
      section: dbRow.section,
      name: dbRow.name,
      quantity: dbRow.quantity,
      quantityMax: dbRow.quantityMax,
      signUps: merged,
    });
  }
  return { ok: true, items: out };
}

const MAX_ITEMS = 500;
const MAX_SIGN_UPS_PER_ITEM = 40;
const MAX_SECTION_LEN = 120;

function generateLiveblocksRoomId(): string {
  return randomBytes(24).toString("base64url");
}

export function normalizeEmailForSignUp(email: string): string {
  return email.trim().toLowerCase();
}

const signUpsInclude = {
  orderBy: { sortOrder: "asc" as const },
};

export async function getPackingListByRoomId(roomId: string) {
  return prisma.packingList.findUnique({
    where: { liveblocksRoomId: roomId },
    include: {
      event: { select: { id: true, title: true } },
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

export async function createPackingListForEvent(eventId: string) {
  const existing = await prisma.packingList.findUnique({
    where: { eventId },
  });
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const liveblocksRoomId = generateLiveblocksRoomId();
    try {
      return await prisma.packingList.create({
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

export async function persistPackingListItems(
  liveblocksRoomId: string,
  items: PackingItemPayload[],
  actor: PackingPersistActor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = await prisma.packingList.findUnique({
    where: { liveblocksRoomId },
    select: {
      id: true,
      items: {
        orderBy: { sortOrder: "asc" },
        include: { signUps: signUpsInclude },
      },
    },
  });
  if (!list) {
    return { ok: false, error: "Packing list not found" };
  }

  let itemsToPersist = items;
  if (actor.kind !== "organizer") {
    const merged = mergeParticipantPackingPayload(
      list.items as DbItemForMerge[],
      items,
      actor,
    );
    if (!merged.ok) return merged;
    itemsToPersist = merged.items;
  }

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
    const sectionRaw = it.section?.trim() ?? "";
    if (sectionRaw.length > MAX_SECTION_LEN) {
      return { ok: false, error: "Section name too long" };
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
    const u = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true },
    });
    if (!u) {
      return { ok: false, error: "Invalid user for sign-up" };
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

      for (let i = 0; i < itemsToPersist.length; i++) {
        const it = itemsToPersist[i];
        const sectionTrim = it.section?.trim() ?? "";
        const section = sectionTrim === "" ? null : sectionTrim;

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
            section,
            name: it.name.trim(),
            quantity: it.quantity,
            quantityMax,
            sortOrder: i,
          },
          update: {
            section,
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
            data: it.signUps.map((su, j) => ({
              id: su.id,
              packingItemId: it.id,
              quantity: su.quantity,
              packed: packedBySignUpId.get(su.id) ?? su.packed,
              displayName: su.displayName.trim(),
              email:
                su.email?.trim() != null && su.email.trim() !== ""
                  ? normalizeEmailForSignUp(su.email)
                  : null,
              userId: su.userId?.trim() || null,
              sortOrder: j,
            })),
          });
        }
      }
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to save packing list";
    return { ok: false, error: message };
  }

  return { ok: true };
}
