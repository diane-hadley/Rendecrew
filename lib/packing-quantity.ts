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

/**
 * True when the item still has room for more sign-ups or has no volunteers yet
 * (aligned with “X left” / “more welcome” hints in the packing UI).
 */
export function packingItemNeedsSignUps(
  quantity: number | null,
  quantityMax: number | null | undefined,
  signUps: readonly { quantity: number | null }[],
): boolean {
  const allocatedSum = signUps.reduce((a, s) => a + (s.quantity ?? 0), 0);
  const qMin = quantity;
  const qMax =
    quantityMax != null && qMin != null && quantityMax >= qMin
      ? quantityMax
      : null;
  const cap = itemQuantityCap(qMin, qMax);

  if (isOptionalPackingMin(qMin)) {
    if (cap == null) return allocatedSum === 0;
    return allocatedSum < cap;
  }

  if (qMin == null) return signUps.length === 0;

  if (cap == null) return true;
  return allocatedSum < cap;
}
