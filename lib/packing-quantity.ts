/**
 * Pure helpers for packing item min/max quantities.
 * Kept separate from `packing-list.ts` so client components can import without Node/prisma.
 */

/** Inclusive upper bound for sign-ups: `quantityMax` when set and valid, else `quantity`. */
export function itemQuantityCap(
  quantity: number | null,
  quantityMax: number | null | undefined,
): number | null {
  if (quantity == null) return null;
  if (
    quantityMax != null &&
    Number.isInteger(quantityMax) &&
    quantityMax >= quantity
  ) {
    return quantityMax;
  }
  return quantity;
}
