import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { EditSectionRow } from "./EditSectionsModal";
import { PersonalPackingEditSectionsModal } from "./PersonalPackingReorderSectionsModal";

function Wrapper({ initial }: { initial: EditSectionRow[] }) {
  const [rows, setRows] = useState(initial);
  return (
    <PersonalPackingEditSectionsModal
      rows={rows}
      setRows={setRows}
      onCancel={() => setRows(initial)}
      onDone={() => {}}
    />
  );
}

describe("PersonalPackingEditSectionsModal", () => {
  it("forwards to EditSectionsModal with the personal title id", () => {
    render(<Wrapper initial={[{ id: "Gear", title: "Gear" }]} />);
    const title = screen.getByRole("heading", { name: "Edit sections" });
    expect(title).toHaveAttribute("id", "personal-packing-edit-sections-title");
  });
});
