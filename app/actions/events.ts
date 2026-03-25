"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { getOrCreateUser } from "@/lib/user";

export type CreateEventInput = {
  title: string;
  description?: string | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  location?: string | null;
};

export type CreateEventResult =
  | { ok: true; eventId: string }
  | { ok: false; error: string };

export type UpdateEventInput = CreateEventInput & {
  eventId: string;
};

export type UpdateEventResult = { ok: true } | { ok: false; error: string };

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createEvent(
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Title is required" };
  }

  const startAt = parseDate(input.startAt);
  const endAt = parseDate(input.endAt);
  const hasStart = startAt != null;
  const hasEnd = endAt != null;
  if (hasStart !== hasEnd) {
    return {
      ok: false,
      error: "Provide both start and end, or leave both empty",
    };
  }
  if (hasStart && hasEnd && startAt && endAt && endAt < startAt) {
    return { ok: false, error: "End must be on or after start" };
  }

  try {
    const user = await getOrCreateUser();

    await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title,
          description: input.description?.trim() || null,
          startAt: startAt ?? null,
          endAt: endAt ?? null,
          location: input.location?.trim() || null,
          createdById: user.id,
        },
      });

      await tx.eventMember.create({
        data: {
          userId: user.id,
          eventId: created.id,
          role: "owner",
        },
      });
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to create event";
    return { ok: false, error: message };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateEvent(
  input: UpdateEventInput,
): Promise<UpdateEventResult> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Title is required" };
  }

  const startAt = parseDate(input.startAt);
  const endAt = parseDate(input.endAt);
  const hasStart = startAt != null;
  const hasEnd = endAt != null;
  if (hasStart !== hasEnd) {
    return {
      ok: false,
      error: "Provide both start and end, or leave both empty",
    };
  }
  if (hasStart && hasEnd && startAt && endAt && endAt < startAt) {
    return { ok: false, error: "End must be on or after start" };
  }

  const user = await getOrCreateUser();
  const row = await getEventForUser(input.eventId, user.id);
  if (!row || !canManageEvent(row.role)) {
    return { ok: false, error: "You do not have permission to edit this event" };
  }

  try {
    await prisma.event.update({
      where: { id: input.eventId },
      data: {
        title,
        description: input.description?.trim() || null,
        startAt: startAt ?? null,
        endAt: endAt ?? null,
        location: input.location?.trim() || null,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to update event";
    return { ok: false, error: message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${input.eventId}`);
  return { ok: true };
}
