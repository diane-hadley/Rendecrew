import { arrayMove } from "@dnd-kit/sortable";
import type { PersonalSectionGroup } from "@/lib/personal-packing-sections";
import {
  storageKeyForPersonalSection,
  type PersonalItemVM,
} from "@/lib/personal-packing-sections";

/** Encoded in sortable keys for uncategorized (must not collide with encodeURIComponent output of normal titles). */
export const PERSONAL_SORT_UNC = "__p_unc__";

function sectionKeyToSortHeaderId(sectionKey: string): string {
  return sectionKey === "" ? PERSONAL_SORT_UNC : encodeURIComponent(sectionKey);
}

export function sectionSortIdToSectionKey(sortIdBody: string): string {
  return sortIdBody === PERSONAL_SORT_UNC ? "" : decodeURIComponent(sortIdBody);
}

/** Composite keys: `s:${id}` section header, `i:${itemId}` row. */
export function buildPersonalPackingSortKeys(
  groups: readonly PersonalSectionGroup[],
): string[] {
  const keys: string[] = [];
  for (const g of groups) {
    keys.push(`s:${sectionKeyToSortHeaderId(g.sectionKey)}`);
    for (const it of g.items) {
      keys.push(`i:${it.id}`);
    }
  }
  return keys;
}

export type ParsedPersonalPackingRow = {
  id: string;
  section: string | null;
};

function isSectionKey(k: string | undefined): boolean {
  return typeof k === "string" && k.startsWith("s:");
}

function isItemKey(k: string | undefined): boolean {
  return typeof k === "string" && k.startsWith("i:");
}

export function parsePersonalPackingSortKeys(
  keys: readonly string[],
): ParsedPersonalPackingRow[] {
  let currentSection: string | null = null;
  const out: ParsedPersonalPackingRow[] = [];
  for (const k of keys) {
    if (k == null || typeof k !== "string") continue;
    if (isSectionKey(k)) {
      const body = k.slice(2);
      const sk = sectionSortIdToSectionKey(body);
      currentSection = sk === "" ? null : sk;
    } else if (isItemKey(k)) {
      out.push({ id: k.slice(2), section: currentSection });
    }
  }
  return out;
}

/** After choosing order of named categories, rebuild keys (Uncategorized last, like Group Packing). */
export function buildPersonalPackingSortKeysAfterSectionReorder(
  namedSectionOrder: readonly string[],
  items: readonly PersonalItemVM[],
): string[] {
  const byKey = new Map<string, PersonalItemVM[]>();
  for (const it of items) {
    const k = storageKeyForPersonalSection(it.section);
    let arr = byKey.get(k);
    if (!arr) {
      arr = [];
      byKey.set(k, arr);
    }
    arr.push(it);
  }
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const keys: string[] = [];
  for (const sk of namedSectionOrder) {
    if (sk === "") continue;
    keys.push(`s:${sectionKeyToSortHeaderId(sk)}`);
    const bucket = byKey.get(sk);
    if (bucket) {
      for (const it of bucket) keys.push(`i:${it.id}`);
    }
  }
  const unc = byKey.get("");
  if (unc?.length) {
    keys.push(`s:${sectionKeyToSortHeaderId("")}`);
    for (const it of unc) keys.push(`i:${it.id}`);
  }
  return keys;
}

/**
 * Item rows only — section headers use "Reorder sections" (same as Group Packing).
 */
export function applyPersonalPackingDrag(
  keys: readonly string[],
  activeId: string,
  overId: string,
): string[] | null {
  if (activeId === overId) return null;
  if (typeof activeId !== "string" || typeof overId !== "string") return null;

  if (isSectionKey(activeId)) return null;

  const oldIndex = keys.indexOf(activeId);
  if (oldIndex < 0) return null;

  if (isItemKey(activeId) && isSectionKey(overId)) {
    let newIndex = keys.indexOf(overId) + 1;
    if (oldIndex < newIndex) newIndex -= 1;
    return arrayMove([...keys], oldIndex, newIndex);
  }

  if (isItemKey(activeId) && isItemKey(overId)) {
    const newIndex = keys.indexOf(overId);
    if (newIndex < 0) return null;
    return arrayMove([...keys], oldIndex, newIndex);
  }

  return null;
}
