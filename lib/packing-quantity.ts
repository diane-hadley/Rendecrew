/**
 * Pure helpers for packing item min/max quantities.
 * Kept separate from `packing-list.ts` so client components can import without Node/prisma.
 */

/**
 * Inclusive upper bound for sign-ups.
 * Optional items use `quantity === 0` with `quantityMax` = desired cap (DB has no separate flag).
 */
export function itemQuantityCap(
  quantity: number | null,
  quantityMax: number | null | undefined,
): number | null {
  if (quantity == null) return null;
  if (quantity === 0) {
    if (
      quantityMax != null &&
      Number.isInteger(quantityMax) &&
      quantityMax > 0
    ) {
      return quantityMax;
    }
    return null;
  }
  if (
    quantityMax != null &&
    Number.isInteger(quantityMax) &&
    quantityMax >= quantity
  ) {
    return quantityMax;
  }
  return quantity;
}

/** Optional = minimum needed is zero (encoded as `quantity` 0, not a DB column). */
export function isOptionalPackingMin(quantity: number | null): boolean {
  return quantity === 0;
}
