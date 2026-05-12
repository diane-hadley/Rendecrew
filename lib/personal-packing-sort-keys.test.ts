import { describe, expect, it } from "vitest";
import {
  PERSONAL_SORT_UNC,
  applyPersonalPackingDrag,
  buildPersonalPackingSortKeys,
  buildPersonalPackingSortKeysAfterSectionReorder,
  parsePersonalPackingSortKeys,
} from "./personal-packing-sort-keys";
import type {
  PersonalItemVM,
  PersonalSectionGroup,
} from "./personal-packing-sections";

describe("buildPersonalPackingSortKeys", () => {
  it("emits section headers then item ids for each group", () => {
    const groups: PersonalSectionGroup[] = [
      {
        sectionKey: "A",
        heading: "A",
        items: [
          {
            id: "1",
            name: "x",
            section: "A",
            quantity: 1,
            packed: false,
            sortOrder: 0,
          },
        ],
      },
      {
        sectionKey: "",
        heading: "Uncategorized",
        items: [
          {
            id: "2",
            name: "y",
            section: null,
            quantity: 1,
            packed: false,
            sortOrder: 0,
          },
        ],
      },
    ];
    expect(buildPersonalPackingSortKeys(groups)).toEqual([
      `s:${encodeURIComponent("A")}`,
      "i:1",
      `s:${PERSONAL_SORT_UNC}`,
      "i:2",
    ]);
  });
});

describe("parsePersonalPackingSortKeys", () => {
  it("skips null and non-string keys", () => {
    const keys = [
      null,
      `s:${PERSONAL_SORT_UNC}`,
      "i:x",
      undefined,
    ] as unknown as string[];
    expect(parsePersonalPackingSortKeys(keys)).toEqual([
      { id: "x", section: null },
    ]);
  });

  it("tracks the current section for subsequent items", () => {
    const keys = [
      `s:${encodeURIComponent("Kitchen")}`,
      "i:a",
      "i:b",
      `s:${PERSONAL_SORT_UNC}`,
      "i:c",
    ];
    expect(parsePersonalPackingSortKeys(keys)).toEqual([
      { id: "a", section: "Kitchen" },
      { id: "b", section: "Kitchen" },
      { id: "c", section: null },
    ]);
  });
});

describe("applyPersonalPackingDrag", () => {
  const k = (keys: string[]) => keys;

  it("moves an item before another item", () => {
    const keys = k([`s:${PERSONAL_SORT_UNC}`, "i:a", "i:b"]);
    const next = applyPersonalPackingDrag(keys, "i:b", "i:a");
    expect(next).toEqual(k([`s:${PERSONAL_SORT_UNC}`, "i:b", "i:a"]));
  });

  it("returns null when active and over are the same", () => {
    const keys = k(["i:a", "i:b"]);
    expect(applyPersonalPackingDrag(keys, "i:a", "i:a")).toBeNull();
  });

  it("returns null when active id is missing from keys", () => {
    const keys = k(["i:a"]);
    expect(applyPersonalPackingDrag(keys, "i:missing", "i:a")).toBeNull();
  });

  it("returns null for non-string ids", () => {
    const keys = k(["i:a", "i:b"]);
    expect(
      applyPersonalPackingDrag(
        keys,
        "i:a" as unknown as string,
        123 as unknown as string,
      ),
    ).toBeNull();
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

  it("moves an item onto a section header (insert after header)", () => {
    const keys = k([
      `s:${encodeURIComponent("A")}`,
      "i:1",
      `s:${encodeURIComponent("B")}`,
      "i:2",
    ]);
    const next = applyPersonalPackingDrag(
      keys,
      "i:2",
      `s:${encodeURIComponent("A")}`,
    );
    expect(next).toEqual(
      k([
        `s:${encodeURIComponent("A")}`,
        "i:2",
        "i:1",
        `s:${encodeURIComponent("B")}`,
      ]),
    );
  });

  it("moves an item onto a section header when dropping lower in the list", () => {
    const keys = k([
      `s:${encodeURIComponent("A")}`,
      "i:1",
      `s:${encodeURIComponent("B")}`,
      "i:2",
    ]);
    const next = applyPersonalPackingDrag(
      keys,
      "i:1",
      `s:${encodeURIComponent("B")}`,
    );
    expect(next).toEqual(
      k([
        `s:${encodeURIComponent("A")}`,
        `s:${encodeURIComponent("B")}`,
        "i:1",
        "i:2",
      ]),
    );
  });

  it("returns null when dropping an item onto a missing item id", () => {
    const keys = k([`s:${encodeURIComponent("A")}`, "i:1"]);
    expect(applyPersonalPackingDrag(keys, "i:1", "i:ghost")).toBeNull();
  });

  it("returns null for unsupported drag targets", () => {
    const keys = k([`s:${encodeURIComponent("A")}`, "i:1", "x:weird"]);
    expect(applyPersonalPackingDrag(keys, "i:1", "x:weird")).toBeNull();
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

  it("skips empty string entries in named order", () => {
    const items = [itm({ id: "1", name: "a", section: "Z", sortOrder: 0 })];
    const keys = buildPersonalPackingSortKeysAfterSectionReorder(
      ["", "Z"],
      items,
    );
    expect(keys).toEqual([`s:${encodeURIComponent("Z")}`, "i:1"]);
  });

  it("omits uncategorized block when there are no unc items", () => {
    const items = [itm({ id: "1", name: "a", section: "Z", sortOrder: 0 })];
    const keys = buildPersonalPackingSortKeysAfterSectionReorder(["Z"], items);
    expect(keys).toEqual([`s:${encodeURIComponent("Z")}`, "i:1"]);
    expect(keys.some((k) => k.includes(PERSONAL_SORT_UNC))).toBe(false);
  });

  it("emits only uncategorized when named order is empty", () => {
    const items = [itm({ id: "u", name: "solo", section: null, sortOrder: 0 })];
    const keys = buildPersonalPackingSortKeysAfterSectionReorder([], items);
    expect(keys).toEqual([`s:${PERSONAL_SORT_UNC}`, "i:u"]);
  });
});
