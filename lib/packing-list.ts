import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export type PackingItemPayload = {
  id: string;
  name: string;
  quantity: number | null;
  packed: boolean;
  claimedByName: string | null;
  claimedByEmail: string | null;
  claimedByUserId: string | null;
};

function generateLiveblocksRoomId(): string {
  return randomBytes(24).toString("base64url");
}

export function normalizeEmailForClaim(email: string): string {
  return email.trim().toLowerCase();
}

export async function getPackingListByRoomId(roomId: string) {
  return prisma.packingList.findUnique({
    where: { liveblocksRoomId: roomId },
    include: {
      event: { select: { id: true, title: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function getPackingListForEvent(eventId: string) {
  return prisma.packingList.findUnique({
    where: { eventId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
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
 * Sets claimedByUserId on items that were claimed with this email before signup.
 */
export async function backfillPackingItemClaimsForUser(
  userId: string,
  email: string,
): Promise<void> {
  const normalized = normalizeEmailForClaim(email);
  if (!normalized) return;

  await prisma.packingItem.updateMany({
    where: {
      claimedByUserId: null,
      claimedByEmail: { equals: normalized, mode: "insensitive" },
    },
    data: { claimedByUserId: userId },
  });
}

export async function persistPackingListItems(
  liveblocksRoomId: string,
  items: PackingItemPayload[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = await prisma.packingList.findUnique({
    where: { liveblocksRoomId },
    select: { id: true },
  });
  if (!list) {
    return { ok: false, error: "Packing list not found" };
  }

  if (items.length > 500) {
    return { ok: false, error: "Too many items" };
  }

  for (const it of items) {
    if (!it.id || typeof it.id !== "string") {
      return { ok: false, error: "Invalid item id" };
    }
    const name = it.name?.trim() ?? "";
    if (!name || name.length > 200) {
      return { ok: false, error: "Invalid item name" };
    }
    if (it.quantity != null && (!Number.isInteger(it.quantity) || it.quantity < 0)) {
      return { ok: false, error: "Invalid quantity" };
    }
  }

  const userIds = new Set(
    items.map((i) => i.claimedByUserId).filter((x): x is string => Boolean(x?.trim())),
  );
  for (const uid of userIds) {
    const u = await prisma.user.findUnique({ where: { id: uid }, select: { id: true } });
    if (!u) {
      return { ok: false, error: "Invalid claimed user" };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
    const incomingIds = items.map((i) => i.id);
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
    const toDelete = existing.filter((e) => !incomingSet.has(e.id)).map((e) => e.id);
    if (toDelete.length) {
      await tx.packingItem.deleteMany({
        where: { id: { in: toDelete }, packingListId: list.id },
      });
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const email =
        it.claimedByEmail?.trim() != null && it.claimedByEmail.trim() !== ""
          ? normalizeEmailForClaim(it.claimedByEmail)
          : null;

      await tx.packingItem.upsert({
        where: { id: it.id },
        create: {
          id: it.id,
          packingListId: list.id,
          name: it.name.trim(),
          quantity: it.quantity,
          packed: it.packed,
          claimedByName: it.claimedByName?.trim() || null,
          claimedByEmail: email,
          claimedByUserId: it.claimedByUserId?.trim() || null,
          sortOrder: i,
        },
        update: {
          name: it.name.trim(),
          quantity: it.quantity,
          packed: it.packed,
          claimedByName: it.claimedByName?.trim() || null,
          claimedByEmail: email,
          claimedByUserId: it.claimedByUserId?.trim() || null,
          sortOrder: i,
        },
      });
    }
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to save packing list";
    return { ok: false, error: message };
  }

  return { ok: true };
}
