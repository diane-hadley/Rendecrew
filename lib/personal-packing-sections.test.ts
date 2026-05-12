import { describe, expect, it } from "vitest";
import {
  buildPersonalItemSectionGroups,
  storageKeyForPersonalSection,
  type PersonalItemVM,
} from "./personal-packing-sections";

function item(
  p: Partial<PersonalItemVM> & Pick<PersonalItemVM, "id" | "name">,
): PersonalItemVM {
  return {
    section: null,
    quantity: 1,
    packed: false,
    sortOrder: 0,
    ...p,
  };
}

describe("buildPersonalItemSectionGroups", () => {
  it("sorts within a section by sortOrder", () => {
    const groups = buildPersonalItemSectionGroups(
      [
        item({ id: "b", name: "B", section: "K", sortOrder: 2 }),
        item({ id: "a", name: "A", section: "K", sortOrder: 1 }),
      ],
      [],
    );
    expect(groups.map((g) => g.sectionKey)).toEqual(["K"]);
    expect(groups[0]!.items.map((it) => it.id)).toEqual(["a", "b"]);
  });

  it("ignores duplicate shared template titles", () => {
    const groups = buildPersonalItemSectionGroups(
      [item({ id: "1", name: "Fork", section: "Kitchen", sortOrder: 0 })],
      ["Kitchen", "Kitchen"],
    );
    expect(groups.map((g) => g.sectionKey)).toEqual(["Kitchen"]);
  });

  it("skips a shared title that has no matching items", () => {
    const groups = buildPersonalItemSectionGroups(
      [item({ id: "1", name: "Loose", section: null, sortOrder: 0 })],
      ["Kitchen", "Gear"],
    );
    expect(groups.map((g) => g.heading)).toEqual(["Uncategorized"]);
  });
});

describe("storageKeyForPersonalSection", () => {
  it("trims whitespace and maps empty to uncategorized key", () => {
    expect(storageKeyForPersonalSection("  Pantry  ")).toBe("Pantry");
    expect(storageKeyForPersonalSection("   ")).toBe("");
    expect(storageKeyForPersonalSection(null)).toBe("");
  });
});
