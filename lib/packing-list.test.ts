import { describe, expect, it } from "vitest";
import {
  listPackingCommitmentsForUser,
  mergeParticipantPackingPayload,
  normalizeEmailForSignUp,
  type PackingItemPayload,
} from "./packing-list";

describe("normalizeEmailForSignUp", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmailForSignUp("  Hello@EXAMPLE.com  ")).toBe(
      "hello@example.com",
    );
  });
});

describe("listPackingCommitmentsForUser", () => {
  it("returns commitments matching userId", () => {
    const rows = listPackingCommitmentsForUser(
      {
        items: [
          {
            id: "i1",
            name: "Tent",
            quantity: 1,
            quantityMax: null,
            signUps: [
              {
                id: "s1",
                userId: "u1",
                quantity: 1,
                packed: false,
              },
              {
                id: "s2",
                userId: "u2",
                quantity: 1,
                packed: true,
              },
            ],
          },
        ],
      },
      "u1",
    );
    expect(rows).toEqual([
      {
        signUpId: "s1",
        itemId: "i1",
        itemName: "Tent",
        itemQuantity: 1,
        signUpQuantity: 1,
        signUpPacked: false,
      },
    ]);
  });

  it("returns empty when no sign-ups for user", () => {
    expect(
      listPackingCommitmentsForUser(
        {
          items: [
            {
              id: "i1",
              name: "X",
              quantity: null,
              quantityMax: null,
              signUps: [{ id: "s1", userId: null, quantity: 2, packed: false }],
            },
          ],
        },
        "u1",
      ),
    ).toEqual([]);
  });
});

describe("mergeParticipantPackingPayload", () => {
  const dbSections: { id: string; title: string }[] = [];
  const dbItems = [
    {
      id: "i1",
      sectionId: null as string | null,
      name: "Tent",
      quantity: 1 as number | null,
      quantityMax: null as number | null,
      signUps: [
        {
          id: "s1",
          quantity: 1,
          displayName: "Pat",
          email: null,
          userId: "u1",
          packed: false,
        },
        {
          id: "s2",
          quantity: 1,
          displayName: "Quinn",
          email: null,
          userId: "u2",
          packed: true,
        },
      ],
    },
  ];

  it("rejects template changes from participant", () => {
    const incoming = {
      sections: [] as { id: string; title: string }[],
      items: [
        {
          id: "i1",
          sectionId: null,
          name: "Renamed",
          quantity: 1,
          signUps: [],
        },
      ] satisfies PackingItemPayload[],
    };
    const r = mergeParticipantPackingPayload(dbSections, dbItems, incoming, {
      kind: "participant",
      userId: "u1",
    });
    expect(r.ok).toBe(false);
  });

  it("merges only the actor’s sign-up while preserving others", () => {
    const incoming = {
      sections: [] as { id: string; title: string }[],
      items: [
        {
          id: "i1",
          sectionId: null,
          name: "Tent",
          quantity: 1,
          signUps: [
            {
              id: "s1",
              quantity: 1,
              displayName: "Pat",
              email: null,
              userId: "u1",
              packed: true,
            },
            {
              id: "s2",
              quantity: 1,
              displayName: "Quinn",
              email: null,
              userId: "u2",
              packed: false,
            },
          ],
        },
      ] satisfies PackingItemPayload[],
    };
    const r = mergeParticipantPackingPayload(dbSections, dbItems, incoming, {
      kind: "participant",
      userId: "u1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0]!.signUps).toEqual([
      {
        id: "s1",
        quantity: 1,
        displayName: "Pat",
        email: null,
        userId: "u1",
        packed: true,
      },
      {
        id: "s2",
        quantity: 1,
        displayName: "Quinn",
        email: null,
        userId: "u2",
        packed: true,
      },
    ]);
  });

  it("allows participant to add a sign-up for another event member when roster is provided", () => {
    const incoming = {
      sections: [] as { id: string; title: string }[],
      items: [
        {
          id: "i1",
          sectionId: null,
          name: "Tent",
          quantity: 1,
          signUps: [
            {
              id: "s1",
              quantity: 1,
              displayName: "Pat",
              email: null,
              userId: "u1",
              packed: false,
            },
            {
              id: "s2",
              quantity: 1,
              displayName: "Quinn",
              email: null,
              userId: "u2",
              packed: true,
            },
            {
              id: "s-new",
              quantity: 1,
              displayName: "Riley",
              email: null,
              userId: "u3",
              packed: false,
            },
          ],
        },
      ] satisfies PackingItemPayload[],
    };
    const r = mergeParticipantPackingPayload(
      dbSections,
      dbItems,
      incoming,
      { kind: "participant", userId: "u1" },
      { eventMemberUserIds: new Set(["u1", "u2", "u3"]) },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0]!.signUps).toHaveLength(3);
    expect(r.items[0]!.signUps.map((s) => s.id).sort()).toEqual([
      "s-new",
      "s1",
      "s2",
    ]);
    const added = r.items[0]!.signUps.find((s) => s.id === "s-new");
    expect(added?.userId).toBe("u3");
  });

  it("allows participant to change another member’s sign-up quantity while preserving identity and packed", () => {
    const incoming = {
      sections: [] as { id: string; title: string }[],
      items: [
        {
          id: "i1",
          sectionId: null,
          name: "Tent",
          quantity: 1,
          signUps: [
            {
              id: "s1",
              quantity: 1,
              displayName: "Pat",
              email: null,
              userId: "u1",
              packed: false,
            },
            {
              id: "s2",
              quantity: 3,
              displayName: "Spoofed name",
              email: null,
              userId: "u2",
              packed: false,
            },
          ],
        },
      ] satisfies PackingItemPayload[],
    };
    const r = mergeParticipantPackingPayload(
      dbSections,
      dbItems,
      incoming,
      { kind: "participant", userId: "u1" },
      { eventMemberUserIds: new Set(["u1", "u2"]) },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s2 = r.items[0]!.signUps.find((s) => s.id === "s2");
    expect(s2?.quantity).toBe(3);
    expect(s2?.displayName).toBe("Quinn");
    expect(s2?.packed).toBe(true);
  });

  it("allows participant to remove another member sign-up when roster is provided", () => {
    const incoming = {
      sections: [] as { id: string; title: string }[],
      items: [
        {
          id: "i1",
          sectionId: null,
          name: "Tent",
          quantity: 1,
          signUps: [
            {
              id: "s1",
              quantity: 1,
              displayName: "Pat",
              email: null,
              userId: "u1",
              packed: false,
            },
          ],
        },
      ] satisfies PackingItemPayload[],
    };
    const r = mergeParticipantPackingPayload(
      dbSections,
      dbItems,
      incoming,
      { kind: "participant", userId: "u1" },
      { eventMemberUserIds: new Set(["u1", "u2"]) },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0]!.signUps).toEqual([
      {
        id: "s1",
        quantity: 1,
        displayName: "Pat",
        email: null,
        userId: "u1",
        packed: false,
      },
    ]);
  });
});
