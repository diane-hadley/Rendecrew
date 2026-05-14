import { PackingSuggestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function countDraftUserPackingSuggestionsForEvent(
  eventId: string,
): Promise<number> {
  return prisma.packingSuggestion.count({
    where: {
      eventId,
      status: PackingSuggestionStatus.DRAFT_USER,
    },
  });
}
