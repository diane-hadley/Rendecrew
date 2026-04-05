import { describe, expect, it } from "vitest";
import {
  isOptionalPackingMin,
  itemQuantityCap,
  packingItemNeedsSignUps,
} from "./packing-quantity";

describe("itemQuantityCap", () => {
  it("returns null when quantity is null", () => {
    expect(itemQuantityCap(null, 5)).toBeNull();
  });

  it("optional item (quantity 0) uses positive integer max as cap", () => {
    expect(itemQuantityCap(0, 4)).toBe(4);
  });

  it("optional item without valid max returns null", () => {
    expect(itemQuantityCap(0, null)).toBeNull();
    expect(itemQuantityCap(0, 0)).toBeNull();
    expect(itemQuantityCap(0, 3.5)).toBeNull();
  });

  it("fixed quantity without range returns quantity", () => {
    expect(itemQuantityCap(5, null)).toBe(5);
    expect(itemQuantityCap(5, undefined)).toBe(5);
  });

  it("uses max when it is an integer >= quantity", () => {
    expect(itemQuantityCap(3, 10)).toBe(10);
    expect(itemQuantityCap(5, 5)).toBe(5);
  });

  it("ignores non-integer max", () => {
    expect(itemQuantityCap(3, 10.5)).toBe(3);
  });
});

describe("isOptionalPackingMin", () => {
  it("is true only for quantity zero", () => {
    expect(isOptionalPackingMin(0)).toBe(true);
    expect(isOptionalPackingMin(null)).toBe(false);
    expect(isOptionalPackingMin(1)).toBe(false);
  });
});

describe("packingItemNeedsSignUps", () => {
  it("is false when fixed quantity is fully signed up", () => {
    expect(packingItemNeedsSignUps(2, null, [{ quantity: 2 }])).toBe(false);
  });

  it("is true when below fixed quantity", () => {
    expect(packingItemNeedsSignUps(2, null, [{ quantity: 1 }])).toBe(true);
  });

  it("is true for optional capped item until cap is reached", () => {
    expect(packingItemNeedsSignUps(0, 4, [])).toBe(true);
    expect(packingItemNeedsSignUps(0, 4, [{ quantity: 3 }])).toBe(true);
    expect(packingItemNeedsSignUps(0, 4, [{ quantity: 4 }])).toBe(false);
  });

  it("optional uncapped: needs sign-ups only when nobody signed up", () => {
    expect(packingItemNeedsSignUps(0, null, [])).toBe(true);
    expect(packingItemNeedsSignUps(0, null, [{ quantity: 1 }])).toBe(false);
  });

  it("quantity unset: needs sign-ups only with zero sign-ups", () => {
    expect(packingItemNeedsSignUps(null, null, [])).toBe(true);
    expect(packingItemNeedsSignUps(null, null, [{ quantity: 1 }])).toBe(false);
  });

  it("range: true between min and max", () => {
    expect(packingItemNeedsSignUps(2, 5, [{ quantity: 2 }])).toBe(true);
    expect(packingItemNeedsSignUps(2, 5, [{ quantity: 5 }])).toBe(false);
  });
});
