import { prisma } from "@/lib/prisma";

/**
 * Serializable event snapshot for the AI coordinator system prompt.
 * Callers can JSON.stringify or format with formatEventContextForAISystemPrompt.
 */
export type EventAIContext = {
  event: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    startAt: string | null;
    endAt: string | null;
  };
  packingList: null | {
    items: Array<{
      name: string;
      quantity: number | null;
      packed: boolean;
      claimedByName: string | null;
      claimedByEmail: string | null;
      hasLinkedUser: boolean;
    }>;
  };
};

export async function getEventContextForAI(
  eventId: string,
): Promise<EventAIContext | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      packingList: {
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  if (!event) return null;

  const { packingList, ...eventRow } = event;

  return {
    event: {
      id: eventRow.id,
      title: eventRow.title,
      description: eventRow.description,
      location: eventRow.location,
      startAt: eventRow.startAt?.toISOString() ?? null,
      endAt: eventRow.endAt?.toISOString() ?? null,
    },
    packingList: packingList
      ? {
          items: packingList.items.map((it) => ({
            name: it.name,
            quantity: it.quantity,
            packed: it.packed,
            claimedByName: it.claimedByName,
            claimedByEmail: it.claimedByEmail,
            hasLinkedUser: it.claimedByUserId != null,
          })),
        }
      : null,
  };
}

/**
 * Human-readable block to append to the coordinator system prompt.
 */
/** Fetches the event and returns a ready-to-append system prompt section, or null if the event is missing. */
export async function getEventAISystemPromptSection(
  eventId: string,
): Promise<string | null> {
  const ctx = await getEventContextForAI(eventId);
  if (!ctx) return null;
  return formatEventContextForAISystemPrompt(ctx);
}

export function formatEventContextForAISystemPrompt(ctx: EventAIContext): string {
  const lines: string[] = [
    "Current event context:",
    `- Title: ${ctx.event.title}`,
    ctx.event.description
      ? `- Description: ${ctx.event.description}`
      : "- Description: (none)",
    ctx.event.location ? `- Location: ${ctx.event.location}` : "- Location: (none)",
    ctx.event.startAt && ctx.event.endAt
      ? `- When: ${ctx.event.startAt} to ${ctx.event.endAt}`
      : "- When: (not set)",
  ];

  if (!ctx.packingList || ctx.packingList.items.length === 0) {
    lines.push("Packing list: (none or empty)");
  } else {
    lines.push("Packing list:");
    for (const it of ctx.packingList.items) {
      const qty =
        it.quantity != null ? ` ×${it.quantity}` : "";
      const status = it.packed ? "packed" : "not packed";
      let claim = "";
      if (it.claimedByName || it.claimedByEmail || it.hasLinkedUser) {
        const parts: string[] = [];
        if (it.claimedByName) parts.push(`claimed by ${it.claimedByName}`);
        if (it.claimedByEmail) parts.push(`email ${it.claimedByEmail}`);
        if (it.hasLinkedUser) parts.push("linked Rendecrew account");
        claim = `; ${parts.join("; ")}`;
      }
      lines.push(`  - ${it.name}${qty} — ${status}${claim}`);
    }
  }

  return lines.join("\n");
}
