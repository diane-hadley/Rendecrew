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
  const dbItems = [
    {
      id: "i1",
      section: "G" as string | null,
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
    const incoming: PackingItemPayload[] = [
      {
        id: "i1",
        section: "G",
        name: "Renamed",
        quantity: 1,
        signUps: [],
      },
    ];
    const r = mergeParticipantPackingPayload(dbItems, incoming, {
      kind: "participant",
      userId: "u1",
    });
    expect(r.ok).toBe(false);
  });

  it("merges only the actor’s sign-up while preserving others", () => {
    const incoming: PackingItemPayload[] = [
      {
        id: "i1",
        section: "G",
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
    ];
    const r = mergeParticipantPackingPayload(dbItems, incoming, {
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
});
