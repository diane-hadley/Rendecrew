import { describe, expect, it } from "vitest";
import { buildPersonalItemSectionGroups } from "./personal-packing-sections";
import type { PersonalItemVM } from "./personal-packing-sections";

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
});
