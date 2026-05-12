import { render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { EditSectionRow } from "./EditSectionsModal";
import { PersonalPackingEditSectionsModal } from "./PersonalPackingReorderSectionsModal";

function Wrapper({
  initial,
  inlineError,
}: {
  initial: EditSectionRow[];
  inlineError?: string | null;
}) {
  const [rows, setRows] = useState(initial);
  return (
    <PersonalPackingEditSectionsModal
      rows={rows}
      setRows={setRows}
      inlineError={inlineError}
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

  it("forwards inlineError into the dialog", () => {
    render(
      <Wrapper
        initial={[{ id: "Gear", title: "Gear" }]}
        inlineError="Save failed"
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Save failed");
  });
});
