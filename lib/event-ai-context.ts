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
      signUps: Array<{
        displayName: string;
        quantity: number | null;
        email: string | null;
        hasLinkedUser: boolean;
        packed: boolean;
      }>;
    }>;
  };
};

const signUpsOrder = { orderBy: { sortOrder: "asc" as const } };

export async function getEventContextForAI(
  eventId: string,
): Promise<EventAIContext | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      packingList: {
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: { signUps: signUpsOrder },
          },
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
            signUps: it.signUps.map((s) => ({
              displayName: s.displayName,
              quantity: s.quantity,
              email: s.email,
              hasLinkedUser: s.userId != null,
              packed: s.packed,
            })),
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
      const qty = it.quantity != null ? ` ×${it.quantity}` : "";
      let signUp = "";
      if (it.signUps.length > 0) {
        const parts = it.signUps.map((s) => {
          const q =
            s.quantity != null
              ? `${s.quantity}${it.quantity != null ? ` of ${it.quantity}` : ""}`
              : it.quantity != null
                ? `all ${it.quantity}`
                : "(amount not set)";
          const pk = s.packed ? "packed" : "not packed yet";
          let extra = `${s.displayName} bringing ${q} (${pk})`;
          if (s.email) extra += `; email ${s.email}`;
          if (s.hasLinkedUser) extra += "; linked Rendecrew account";
          return extra;
        });
        signUp = `; ${parts.join("; ")}`;
      }
      lines.push(`  - ${it.name}${qty}${signUp}`);
    }
  }

  return lines.join("\n");
}
