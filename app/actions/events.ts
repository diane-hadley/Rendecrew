"use server";

import { EventMemberRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  insertNotificationIgnoringPreferences,
  isNotificationEnabledForUserEvent,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { canDeleteEvent, canManageEvent, getEventForUser } from "@/lib/events";
import { parseEventFromNaturalLanguage } from "@/lib/parse-event-natural-language";
import { normalizeTimeZone, parseEventDateTime } from "@/lib/event-datetime";
import { getOrCreateUser } from "@/lib/user";

export type CreateEventInput = {
  title: string;
  generalInformation?: string | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  /** IANA zone for interpreting `startAt` wall time. Defaults to user timezone. */
  startAtTimeZone?: string | null;
  /** IANA zone for interpreting `endAt` wall time. Defaults to user timezone. */
  endAtTimeZone?: string | null;
  location?: string | null;
};

export type CreateEventResult =
  | { ok: true; eventId: string }
  | { ok: false; error: string };

export type UpdateEventInput = CreateEventInput & {
  eventId: string;
};

export type UpdateEventResult = { ok: true } | { ok: false; error: string };

export type DeleteEventResult = { ok: true } | { ok: false; error: string };

function validateCreateEventInput(
  input: CreateEventInput,
  startTz: string,
  endTz: string,
): string | null {
  const title = input.title.trim();
  if (!title) {
    return "Title is required";
  }

  const startAt = parseEventDateTime(input.startAt, startTz);
  const endAt = parseEventDateTime(input.endAt, endTz);
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
  actorDefaultTimeZone: string,
): Promise<CreateEventResult> {
  const startTz = normalizeTimeZone(
    input.startAtTimeZone,
    actorDefaultTimeZone,
  );
  const endTz = normalizeTimeZone(input.endAtTimeZone, startTz);
  const validationError = validateCreateEventInput(input, startTz, endTz);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const title = input.title.trim();
  const startAt = parseEventDateTime(input.startAt, startTz);
  const endAt = parseEventDateTime(input.endAt, endTz);

  try {
    let eventId = "";
    await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title,
          generalInformation: input.generalInformation?.trim() || null,
          startAt: startAt ?? null,
          startAtTimeZone: startTz,
          endAt: endAt ?? null,
          endAtTimeZone: endTz,
          location: input.location?.trim() || null,
          createdById: userId,
        },
      });
      eventId = created.id;

      await tx.eventMember.create({
        data: {
          userId,
          eventId: created.id,
          role: EventMemberRole.creator,
        },
      });
    });
    return { ok: true, eventId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create event";
    return { ok: false, error: message };
  }
}

export async function createEvent(
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const user = await getOrCreateUser();
  const result = await createEventRecord(user.id, input, user.timezone);
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
  const result = await createEventRecord(
    user.id,
    {
      title: fields.title,
      generalInformation: fields.generalInformation,
      location: fields.location,
      startAt: fields.startAt,
      endAt: fields.endAt,
      startAtTimeZone: user.timezone,
      endAtTimeZone: user.timezone,
    },
    user.timezone,
  );
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

  const user = await getOrCreateUser();
  const row = await getEventForUser(input.eventId, user.id);
  if (!row || !canManageEvent(row.role)) {
    return {
      ok: false,
      error: "You do not have permission to edit this event",
    };
  }

  const startTz = normalizeTimeZone(
    input.startAtTimeZone,
    row.event.startAtTimeZone,
  );
  const endTz = normalizeTimeZone(input.endAtTimeZone, startTz);

  const startAt = parseEventDateTime(input.startAt, startTz);
  const endAt = parseEventDateTime(input.endAt, endTz);
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
    await prisma.event.update({
      where: { id: input.eventId },
      data: {
        title,
        generalInformation: input.generalInformation?.trim() || null,
        startAt: startAt ?? null,
        startAtTimeZone: startTz,
        endAt: endAt ?? null,
        endAtTimeZone: endTz,
        location: input.location?.trim() || null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update event";
    return { ok: false, error: message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${input.eventId}`);
  return { ok: true };
}

export async function deleteEvent(eventId: string): Promise<DeleteEventResult> {
  const user = await getOrCreateUser();
  const row = await getEventForUser(eventId, user.id);
  if (!row || !canDeleteEvent(user.id, row.event)) {
    return {
      ok: false,
      error: "Only the event creator can delete this event",
    };
  }

  const snapshot = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      eventMembers: { select: { userId: true } },
    },
  });
  if (!snapshot) {
    return { ok: false, error: "Event not found" };
  }

  const prefResults = await Promise.all(
    snapshot.eventMembers.map((m) =>
      isNotificationEnabledForUserEvent({
        recipientUserId: m.userId,
        eventId,
        kind: "event.member_removed",
      }).then((on) => ({ userId: m.userId, on })),
    ),
  );
  const allowByUserId = new Map(
    prefResults.map(({ userId, on }) => [userId, on] as const),
  );

  try {
    await prisma.event.delete({ where: { id: eventId } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete event";
    return { ok: false, error: message };
  }

  const inserts = snapshot.eventMembers
    .filter((m) => m.userId !== user.id && allowByUserId.get(m.userId))
    .map((m) =>
      insertNotificationIgnoringPreferences({
        recipientUserId: m.userId,
        actorUserId: user.id,
        kind: "event.member_removed",
        metadata: {
          eventId,
          eventTitle: snapshot.title,
        },
      }),
    );
  await Promise.all(inserts);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}
