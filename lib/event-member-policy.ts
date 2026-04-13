import { EventMemberRole, MemberManagementPolicy } from "@prisma/client";

export function actorCanAddMembers(
  actorRole: EventMemberRole,
  policy: MemberManagementPolicy,
): boolean {
  if (isEventAdminRole(actorRole)) return true;
  return (
    policy === MemberManagementPolicy.ANY_MEMBER_CAN_INVITE &&
    actorRole === EventMemberRole.member
  );
}

export function isEventAdminRole(role: EventMemberRole): boolean {
  return role === EventMemberRole.creator || role === EventMemberRole.admin;
}

export function authorizePromoteToAdmin(
  actorRole: EventMemberRole,
  targetRole: EventMemberRole,
): { ok: true } | { ok: false; error: string } {
  if (!isEventAdminRole(actorRole)) {
    return { ok: false, error: "Only admins can promote members." };
  }
  if (targetRole !== EventMemberRole.member) {
    return { ok: false, error: "Only members can be promoted to admin." };
  }
  return { ok: true };
}

export function authorizeDemoteAdmin(
  actorUserId: string,
  eventCreatorId: string,
  targetUserId: string,
  targetRole: EventMemberRole,
): { ok: true } | { ok: false; error: string } {
  if (actorUserId !== eventCreatorId) {
    return {
      ok: false,
      error: "Only the event creator can demote another admin.",
    };
  }
  if (targetRole !== EventMemberRole.admin) {
    return { ok: false, error: "Only admins can be demoted." };
  }
  if (targetUserId === eventCreatorId) {
    return { ok: false, error: "The creator cannot be demoted." };
  }
  return { ok: true };
}

/**
 * Removing another member's row, or self ("leave"). Hierarchy rules override policy.
 */
export function authorizeRemoveOrLeaveMember(params: {
  actorUserId: string;
  actorRole: EventMemberRole;
  targetUserId: string;
  targetRole: EventMemberRole;
  eventCreatorId: string;
  policy: MemberManagementPolicy;
}): { ok: true } | { ok: false; error: string } {
  const {
    actorUserId,
    actorRole,
    targetUserId,
    targetRole,
    eventCreatorId,
    policy,
  } = params;
  const actorIsCreator = actorUserId === eventCreatorId;

  if (actorUserId === targetUserId) {
    // Event creator cannot leave voluntarily (no transfer in v1), regardless of
    // membership row role if data were ever inconsistent.
    if (actorUserId === eventCreatorId) {
      return {
        ok: false,
        error: "The creator cannot leave without deleting the event.",
      };
    }
    return { ok: true };
  }

  if (targetRole === EventMemberRole.creator) {
    return { ok: false, error: "The creator cannot be removed." };
  }

  if (targetRole === EventMemberRole.admin) {
    if (!actorIsCreator) {
      return {
        ok: false,
        error: "Only the event creator can remove another admin.",
      };
    }
    return { ok: true };
  }

  if (isEventAdminRole(actorRole)) {
    return { ok: true };
  }
  if (
    policy === MemberManagementPolicy.ANY_MEMBER_CAN_INVITE &&
    actorRole === EventMemberRole.member
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    error: "You do not have permission to remove this member.",
  };
}
