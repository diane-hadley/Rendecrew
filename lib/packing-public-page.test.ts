import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSuggestionApprovalRequiredForEvent,
  listPackingSignupMembersForEventOrderedByName,
} from "./packing-public-page";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    eventMember: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";

describe("packing-public-page", () => {
  beforeEach(() => {
    vi.mocked(prisma.event.findUnique).mockReset();
    vi.mocked(prisma.eventMember.findMany).mockReset();
  });

  it("getSuggestionApprovalRequiredForEvent defaults false when missing", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(null);
    await expect(getSuggestionApprovalRequiredForEvent("e1")).resolves.toBe(
      false,
    );
  });

  it("listPackingSignupMembersForEventOrderedByName maps user stubs", async () => {
    vi.mocked(prisma.eventMember.findMany).mockResolvedValue([
      { user: { id: "u1", name: "Alex", email: "a@x.com" } },
    ] as never);
    await expect(
      listPackingSignupMembersForEventOrderedByName("e1"),
    ).resolves.toEqual([{ userId: "u1", name: "Alex" }]);
  });
});
