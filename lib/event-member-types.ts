import type { EventMemberRole } from "@prisma/client";

export type EventMemberListItem = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: EventMemberRole;
  createdAt: string;
};
