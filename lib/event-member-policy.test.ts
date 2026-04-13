import { EventMemberRole, MemberManagementPolicy } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  actorCanAddMembers,
  authorizeDemoteAdmin,
  authorizePromoteToAdmin,
  authorizeRemoveOrLeaveMember,
} from "./event-member-policy";

describe("actorCanAddMembers", () => {
  it("allows admins regardless of policy", () => {
    expect(
      actorCanAddMembers(
        EventMemberRole.admin,
        MemberManagementPolicy.ADMINS_ONLY,
      ),
    ).toBe(true);
  });

  it("allows members when policy is ANY_MEMBER", () => {
    expect(
      actorCanAddMembers(
        EventMemberRole.member,
        MemberManagementPolicy.ANY_MEMBER_CAN_INVITE,
      ),
    ).toBe(true);
  });

  it("denies members when policy is ADMINS_ONLY", () => {
    expect(
      actorCanAddMembers(
        EventMemberRole.member,
        MemberManagementPolicy.ADMINS_ONLY,
      ),
    ).toBe(false);
  });
});

describe("authorizePromoteToAdmin", () => {
  it("allows any admin to promote a member", () => {
    expect(
      authorizePromoteToAdmin(EventMemberRole.admin, EventMemberRole.member).ok,
    ).toBe(true);
  });

  it("denies members from promoting", () => {
    expect(
      authorizePromoteToAdmin(EventMemberRole.member, EventMemberRole.member)
        .ok,
    ).toBe(false);
  });
});

describe("authorizeDemoteAdmin", () => {
  it("allows creator to demote another admin", () => {
    expect(
      authorizeDemoteAdmin(
        "creator-id",
        "creator-id",
        "admin-id",
        EventMemberRole.admin,
      ).ok,
    ).toBe(true);
  });

  it("denies non-creator", () => {
    expect(
      authorizeDemoteAdmin(
        "admin-id",
        "creator-id",
        "other-admin",
        EventMemberRole.admin,
      ).ok,
    ).toBe(false);
  });
});

describe("authorizeRemoveOrLeaveMember", () => {
  const policy = MemberManagementPolicy.ANY_MEMBER_CAN_INVITE;

  it("forbids removing the creator", () => {
    const r = authorizeRemoveOrLeaveMember({
      actorUserId: "admin",
      actorRole: EventMemberRole.admin,
      targetUserId: "creator",
      targetRole: EventMemberRole.creator,
      eventCreatorId: "creator",
      policy,
    });
    expect(r.ok).toBe(false);
  });

  it("forbids non-creator removing another admin", () => {
    const r = authorizeRemoveOrLeaveMember({
      actorUserId: "admin-a",
      actorRole: EventMemberRole.admin,
      targetUserId: "admin-b",
      targetRole: EventMemberRole.admin,
      eventCreatorId: "creator",
      policy,
    });
    expect(r.ok).toBe(false);
  });

  it("allows creator to remove another admin", () => {
    const r = authorizeRemoveOrLeaveMember({
      actorUserId: "creator",
      actorRole: EventMemberRole.creator,
      targetUserId: "admin-b",
      targetRole: EventMemberRole.admin,
      eventCreatorId: "creator",
      policy,
    });
    expect(r.ok).toBe(true);
  });

  it("allows admin to leave", () => {
    const r = authorizeRemoveOrLeaveMember({
      actorUserId: "admin-a",
      actorRole: EventMemberRole.admin,
      targetUserId: "admin-a",
      targetRole: EventMemberRole.admin,
      eventCreatorId: "creator",
      policy,
    });
    expect(r.ok).toBe(true);
  });

  it("forbids the event creator from leaving (self-removal)", () => {
    const r = authorizeRemoveOrLeaveMember({
      actorUserId: "creator",
      actorRole: EventMemberRole.creator,
      targetUserId: "creator",
      targetRole: EventMemberRole.creator,
      eventCreatorId: "creator",
      policy,
    });
    expect(r.ok).toBe(false);
  });

  it("forbids creator self-removal even if membership role were admin", () => {
    const r = authorizeRemoveOrLeaveMember({
      actorUserId: "creator",
      actorRole: EventMemberRole.admin,
      targetUserId: "creator",
      targetRole: EventMemberRole.admin,
      eventCreatorId: "creator",
      policy,
    });
    expect(r.ok).toBe(false);
  });

  it("denies members removing another member when policy is ADMINS_ONLY", () => {
    const r = authorizeRemoveOrLeaveMember({
      actorUserId: "mem-a",
      actorRole: EventMemberRole.member,
      targetUserId: "mem-b",
      targetRole: EventMemberRole.member,
      eventCreatorId: "creator",
      policy: MemberManagementPolicy.ADMINS_ONLY,
    });
    expect(r.ok).toBe(false);
  });

  it("allows members removing another member when policy is ANY_MEMBER", () => {
    const r = authorizeRemoveOrLeaveMember({
      actorUserId: "mem-a",
      actorRole: EventMemberRole.member,
      targetUserId: "mem-b",
      targetRole: EventMemberRole.member,
      eventCreatorId: "creator",
      policy: MemberManagementPolicy.ANY_MEMBER_CAN_INVITE,
    });
    expect(r.ok).toBe(true);
  });

  it("allows admins to remove a member when policy is ADMINS_ONLY", () => {
    const r = authorizeRemoveOrLeaveMember({
      actorUserId: "admin-a",
      actorRole: EventMemberRole.admin,
      targetUserId: "mem-b",
      targetRole: EventMemberRole.member,
      eventCreatorId: "creator",
      policy: MemberManagementPolicy.ADMINS_ONLY,
    });
    expect(r.ok).toBe(true);
  });
});
