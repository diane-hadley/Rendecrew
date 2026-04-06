"use server";

import { PackingSuggestionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

async function revalidatePackingForEvent(eventId: string) {
  const pl = await prisma.packingList.findUnique({
    where: { eventId },
    select: { liveblocksRoomId: true },
  });
  revalidatePath(`/dashboard/events/${eventId}`);
  if (pl) revalidatePath(`/packing/${pl.liveblocksRoomId}`);
}

export async function setSuggestionApprovalRequired(
  eventId: string,
  required: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const row = await getEventForUser(eventId, user.id);
    if (!row || !canManageEvent(row.role)) {
      return { ok: false, error: "Not allowed" };
    }
    await prisma.event.update({
      where: { id: eventId },
      data: { suggestionApprovalRequired: required },
    });
    await revalidatePackingForEvent(eventId);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not update suggestion settings";
    return { ok: false, error: message };
  }
}

export async function suggestPackingItem(
  eventId: string,
  input: {
    name: string;
    section?: string | null;
    defaultQuantity?: number | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const row = await getEventForUser(eventId, user.id);
    if (!row) {
      return { ok: false, error: "Event not found" };
    }
    const name = input.name?.trim() ?? "";
    if (!name || name.length > 200) {
      return { ok: false, error: "Invalid name" };
    }
    const sectionRaw = input.section?.trim() ?? "";
    const section = sectionRaw === "" ? null : sectionRaw.slice(0, 120);
    let dq = input.defaultQuantity;
    if (dq != null) {
      if (!Number.isInteger(dq) || dq < 1) {
        return { ok: false, error: "Invalid default quantity" };
      }
    } else {
      dq = null;
    }
    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      select: { suggestionApprovalRequired: true },
    });
    const status =
      ev?.suggestionApprovalRequired === true
        ? PackingSuggestionStatus.DRAFT_USER
        : PackingSuggestionStatus.PUBLISHED;
    const created = await prisma.packingSuggestion.create({
      data: {
        eventId,
        name,
        section,
        defaultQuantity: dq,
        status,
        createdByUserId: user.id,
      },
    });
    await revalidatePackingForEvent(eventId);
    return { ok: true, id: created.id };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not submit suggestion";
    return { ok: false, error: message };
  }
}

export async function moderatePackingSuggestion(
  suggestionId: string,
  action: "publish" | "reject" | "archive",
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const sug = await prisma.packingSuggestion.findUnique({
      where: { id: suggestionId },
      select: { eventId: true, status: true },
    });
    if (!sug) return { ok: false, error: "Suggestion not found" };
    const row = await getEventForUser(sug.eventId, user.id);
    if (!row || !canManageEvent(row.role)) {
      return { ok: false, error: "Not allowed" };
    }
    const nextStatus =
      action === "publish"
        ? PackingSuggestionStatus.PUBLISHED
        : action === "reject"
          ? PackingSuggestionStatus.REJECTED
          : PackingSuggestionStatus.ARCHIVED;
    await prisma.packingSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: nextStatus,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
      },
    });
    await revalidatePackingForEvent(sug.eventId);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not update suggestion";
    return { ok: false, error: message };
  }
}

export async function markSuggestionsCatalogSeen(
  eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const row = await getEventForUser(eventId, user.id);
    if (!row) {
      return { ok: false, error: "Event not found" };
    }
    const now = new Date();
    await prisma.userSuggestionState.upsert({
      where: {
        userId_eventId: { userId: user.id, eventId },
      },
      create: {
        userId: user.id,
        eventId,
        lastSeenSuggestionCatalogAt: now,
      },
      update: { lastSeenSuggestionCatalogAt: now },
    });
    await revalidatePackingForEvent(eventId);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not update catalog state";
    return { ok: false, error: message };
  }
}

export async function copySuggestionToPersonal(
  suggestionId: string,
  quantity?: number,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const sug = await prisma.packingSuggestion.findFirst({
      where: {
        id: suggestionId,
        status: PackingSuggestionStatus.PUBLISHED,
      },
    });
    if (!sug) {
      return { ok: false, error: "Suggestion not available" };
    }
    const row = await getEventForUser(sug.eventId, user.id);
    if (!row) {
      return { ok: false, error: "Event not found" };
    }
    const existing = await prisma.personalPackingItem.findFirst({
      where: { userId: user.id, sourceSuggestionId: suggestionId },
      select: { id: true },
    });
    if (existing) {
      return { ok: false, error: "Already copied to your list" };
    }
    let q = quantity ?? sug.defaultQuantity ?? 1;
    if (!Number.isInteger(q) || q < 1) q = 1;
    const maxSort = await prisma.personalPackingItem.aggregate({
      where: { eventId: sug.eventId, userId: user.id },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    const created = await prisma.personalPackingItem.create({
      data: {
        eventId: sug.eventId,
        userId: user.id,
        name: sug.name,
        section: sug.section,
        quantity: q,
        sortOrder,
        packed: false,
        sourceSuggestionId: sug.id,
      },
    });
    await revalidatePackingForEvent(sug.eventId);
    return { ok: true, id: created.id };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not copy to personal list";
    return { ok: false, error: message };
  }
}

export async function createPersonalPackingItem(
  eventId: string,
  input: { name: string; section?: string | null; quantity?: number },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const row = await getEventForUser(eventId, user.id);
    if (!row) return { ok: false, error: "Event not found" };
    const name = input.name?.trim() ?? "";
    if (!name || name.length > 200) {
      return { ok: false, error: "Invalid name" };
    }
    const sectionRaw = input.section?.trim() ?? "";
    const section = sectionRaw === "" ? null : sectionRaw.slice(0, 120);
    let q = input.quantity ?? 1;
    if (!Number.isInteger(q) || q < 1) q = 1;
    const maxSort = await prisma.personalPackingItem.aggregate({
      where: { eventId, userId: user.id },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    const created = await prisma.personalPackingItem.create({
      data: {
        eventId,
        userId: user.id,
        name,
        section,
        quantity: q,
        sortOrder,
        packed: false,
      },
    });
    await revalidatePackingForEvent(eventId);
    return { ok: true, id: created.id };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not create personal item";
    return { ok: false, error: message };
  }
}

export async function updatePersonalPackingItem(
  itemId: string,
  input: {
    name?: string;
    section?: string | null;
    quantity?: number;
    packed?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const existing = await prisma.personalPackingItem.findFirst({
      where: { id: itemId, userId: user.id },
    });
    if (!existing) return { ok: false, error: "Not found" };
    const data: {
      name?: string;
      section?: string | null;
      quantity?: number;
      packed?: boolean;
    } = {};
    if (input.name !== undefined) {
      const n = input.name.trim();
      if (!n || n.length > 200) return { ok: false, error: "Invalid name" };
      data.name = n;
    }
    if (input.section !== undefined) {
      const t = input.section?.trim() ?? "";
      data.section = t === "" ? null : t.slice(0, 120);
    }
    if (input.quantity !== undefined) {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) {
        return { ok: false, error: "Invalid quantity" };
      }
      data.quantity = input.quantity;
    }
    if (input.packed !== undefined) data.packed = input.packed;
    await prisma.personalPackingItem.update({
      where: { id: itemId },
      data,
    });
    await revalidatePackingForEvent(existing.eventId);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not update personal item";
    return { ok: false, error: message };
  }
}

export async function deletePersonalPackingItem(
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await getOrCreateUser();
    const existing = await prisma.personalPackingItem.findFirst({
      where: { id: itemId, userId: user.id },
      select: { eventId: true },
    });
    if (!existing) return { ok: false, error: "Not found" };
    await prisma.personalPackingItem.delete({ where: { id: itemId } });
    await revalidatePackingForEvent(existing.eventId);
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not delete personal item";
    return { ok: false, error: message };
  }
}
