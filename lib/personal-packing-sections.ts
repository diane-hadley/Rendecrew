/**
 * Personal packing list: section grouping + sort keys for drag-and-drop.
 * Shared between server data assembly and client UI.
 */

export type PersonalItemVM = {
  id: string;
  name: string;
  section: string | null;
  quantity: number;
  packed: boolean;
  sortOrder: number;
};

export type PersonalSectionGroup = {
  /** Storage key: "" means uncategorized */
  sectionKey: string;
  heading: string;
  items: PersonalItemVM[];
};

/** Trimmed section label, or "" when the item has no category. */
export function storageKeyForPersonalSection(
  section: string | null | undefined,
): string {
  const t = section?.trim() ?? "";
  return t === "" ? "" : t;
}

/**
 * Order categories like the shared list: shared template section titles first
 * (in list order), then any extra personal-only sections A–Z, then Uncategorized.
 * Within each section, items are ordered by `sortOrder`.
 */
export function buildPersonalItemSectionGroups(
  items: PersonalItemVM[],
  sharedSectionTitles: readonly string[],
): PersonalSectionGroup[] {
  const byKey = new Map<string, PersonalItemVM[]>();
  for (const it of items) {
    const key = storageKeyForPersonalSection(it.section);
    let arr = byKey.get(key);
    if (!arr) {
      arr = [];
      byKey.set(key, arr);
    }
    arr.push(it);
  }

  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const placed = new Set<string>();
  const groups: PersonalSectionGroup[] = [];

  for (const raw of sharedSectionTitles) {
    const title = raw.trim();
    if (title === "") continue;
    const bucket = byKey.get(title);
    if (!bucket?.length || placed.has(title)) continue;
    placed.add(title);
    groups.push({ sectionKey: title, heading: title, items: bucket });
  }

  const extraKeys = [...byKey.keys()].filter((k) => k !== "" && !placed.has(k));
  extraKeys.sort((a, b) => a.localeCompare(b));
  for (const k of extraKeys) {
    groups.push({ sectionKey: k, heading: k, items: byKey.get(k)! });
  }

  const unc = byKey.get("");
  if (unc?.length) {
    groups.push({
      sectionKey: "",
      heading: "Uncategorized",
      items: unc,
    });
  }

  return groups;
}
