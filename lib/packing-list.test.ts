import { describe, expect, it } from "vitest";
import {
  listPackingCommitmentsForUser,
  normalizeEmailForSignUp,
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
