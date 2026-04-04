import { describe, expect, it } from "vitest";
import { isOptionalPackingMin, itemQuantityCap } from "./packing-quantity";

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
