import { describe, expect, it } from "vitest";
import {
  PERSONAL_SORT_UNC,
  applyPersonalPackingDrag,
  buildPersonalPackingSortKeysAfterSectionReorder,
} from "./personal-packing-sort-keys";
import type { PersonalItemVM } from "./personal-packing-sections";

describe("applyPersonalPackingDrag", () => {
  const k = (keys: string[]) => keys;

  it("moves an item before another item", () => {
    const keys = k([`s:${PERSONAL_SORT_UNC}`, "i:a", "i:b"]);
    const next = applyPersonalPackingDrag(keys, "i:b", "i:a");
    expect(next).toEqual(k([`s:${PERSONAL_SORT_UNC}`, "i:b", "i:a"]));
  });

  it("does not move section headers in the main list", () => {
    const keys = k([
      `s:${encodeURIComponent("A")}`,
      "i:1",
      `s:${encodeURIComponent("B")}`,
      "i:2",
    ]);
    const next = applyPersonalPackingDrag(
      keys,
      `s:${encodeURIComponent("A")}`,
      `s:${encodeURIComponent("B")}`,
    );
    expect(next).toBeNull();
  });
});

describe("buildPersonalPackingSortKeysAfterSectionReorder", () => {
  const itm = (
    p: Partial<PersonalItemVM> & Pick<PersonalItemVM, "id" | "name">,
  ): PersonalItemVM => ({
    section: null,
    quantity: 1,
    packed: false,
    sortOrder: 0,
    ...p,
  });

  it("orders named sections then uncategorized", () => {
    const items = [
      itm({ id: "1", name: "x", section: "B", sortOrder: 0 }),
      itm({ id: "2", name: "y", section: "A", sortOrder: 0 }),
      itm({ id: "3", name: "z", section: null, sortOrder: 0 }),
    ];
    const keys = buildPersonalPackingSortKeysAfterSectionReorder(
      ["B", "A"],
      items,
    );
    expect(keys).toEqual([
      `s:${encodeURIComponent("B")}`,
      "i:1",
      `s:${encodeURIComponent("A")}`,
      "i:2",
      `s:${PERSONAL_SORT_UNC}`,
      "i:3",
    ]);
  });
});
