"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

const DEFAULT_STATUS = "draft";

export type CreateEventInput = {
  title: string;
  description?: string | null;
  status?: string;
  startAt: Date | string;
  endAt: Date | string;
  location?: string | null;
};

export type CreateEventResult =
  | { ok: true; eventId: string }
  | { ok: false; error: string };

function parseDate(value: Date | string): Date | null {
  const d = value instanceof Date ? value : new Date(value);
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
  if (!startAt || !endAt) {
    return { ok: false, error: "Valid start and end dates are required" };
  }
  if (endAt < startAt) {
    return { ok: false, error: "End must be on or after start" };
  }

  try {
    const user = await getOrCreateUser();

    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title,
          description: input.description?.trim() || null,
          status: input.status?.trim() || DEFAULT_STATUS,
          startAt,
          endAt,
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

      return created;
    });

    revalidatePath("/dashboard");
    return { ok: true, eventId: event.id };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to create event";
    return { ok: false, error: message };
  }
}
