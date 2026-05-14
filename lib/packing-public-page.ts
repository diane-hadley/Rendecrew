import { prisma } from "@/lib/prisma";

export async function getSuggestionApprovalRequiredForEvent(
  eventId: string,
): Promise<boolean> {
  const eventRow = await prisma.event.findUnique({
    where: { id: eventId },
    select: { suggestionApprovalRequired: true },
  });
  return eventRow?.suggestionApprovalRequired ?? false;
}

export type PackingSignupMemberStub = { userId: string; name: string };

export async function listPackingSignupMembersForEventOrderedByName(
  eventId: string,
): Promise<PackingSignupMemberStub[]> {
  const memberRows = await prisma.eventMember.findMany({
    where: { eventId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return memberRows.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
  }));
}
