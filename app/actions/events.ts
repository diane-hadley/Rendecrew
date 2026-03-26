"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageEvent, getEventForUser } from "@/lib/events";
import { parseEventFromNaturalLanguage } from "@/lib/parse-event-natural-language";
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

function validateCreateEventInput(input: CreateEventInput): string | null {
  const title = input.title.trim();
  if (!title) {
    return "Title is required";
  }

  const startAt = parseDate(input.startAt);
  const endAt = parseDate(input.endAt);
  const hasStart = startAt != null;
  const hasEnd = endAt != null;
  if (hasStart !== hasEnd) {
    return "Provide both start and end, or leave both empty";
  }
  if (hasStart && hasEnd && startAt && endAt && endAt < startAt) {
    return "End must be on or after start";
  }
  return null;
}

async function createEventRecord(
  userId: string,
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const validationError = validateCreateEventInput(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const title = input.title.trim();
  const startAt = parseDate(input.startAt);
  const endAt = parseDate(input.endAt);

  try {
    let eventId = "";
    await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title,
          description: input.description?.trim() || null,
          startAt: startAt ?? null,
          endAt: endAt ?? null,
          location: input.location?.trim() || null,
          createdById: userId,
        },
      });
      eventId = created.id;

      await tx.eventMember.create({
        data: {
          userId,
          eventId: created.id,
          role: "owner",
        },
      });
    });
    return { ok: true, eventId };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to create event";
    return { ok: false, error: message };
  }
}

export async function createEvent(
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const user = await getOrCreateUser();
  const result = await createEventRecord(user.id, input);
  if (!result.ok) {
    return result;
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/**
 * Parses plain-language text with Claude, creates the event, then redirects to its detail page.
 */
export async function createEventFromNaturalLanguage(
  plainText: string,
): Promise<CreateEventResult> {
  const user = await getOrCreateUser();
  const parsed = await parseEventFromNaturalLanguage(
    plainText,
    new Date().toISOString(),
  );
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const { fields } = parsed;
  const result = await createEventRecord(user.id, {
    title: fields.title,
    description: fields.description,
    location: fields.location,
    startAt: fields.startAt,
    endAt: fields.endAt,
  });
  if (!result.ok) {
    return result;
  }

  const detailPath = `/dashboard/events/${result.eventId}`;
  revalidatePath("/dashboard");
  revalidatePath(detailPath);
  redirect(detailPath);
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
