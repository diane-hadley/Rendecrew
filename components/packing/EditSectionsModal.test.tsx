import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditSectionsModal, type EditSectionRow } from "./EditSectionsModal";

function ModalHarness({
  initialRows,
  onCancel,
  onDone,
  title = "Edit sections",
}: {
  initialRows: EditSectionRow[];
  onCancel: () => void;
  onDone: () => void;
  title?: string;
}) {
  const [rows, setRows] = useState(initialRows);
  return (
    <EditSectionsModal
      titleId="edit-sections-test-title"
      title={title}
      rows={rows}
      setRows={setRows}
      maxTitleLength={120}
      onCancel={onCancel}
      onDone={onDone}
    />
  );
}

describe("EditSectionsModal", () => {
  it("renders the title from props", () => {
    render(
      <ModalHarness
        initialRows={[{ id: "s1", title: "Alpha" }]}
        onCancel={vi.fn()}
        onDone={vi.fn()}
        title="Reorder categories"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Reorder categories" }),
    ).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is pressed", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ModalHarness
        initialRows={[{ id: "s1", title: "Alpha" }]}
        onCancel={onCancel}
        onDone={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onDone when Done is pressed", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <ModalHarness
        initialRows={[{ id: "s1", title: "Alpha" }]}
        onCancel={vi.fn()}
        onDone={onDone}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("updates a section title via the text field", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <ModalHarness
        initialRows={[{ id: "s1", title: "Old" }]}
        onCancel={vi.fn()}
        onDone={onDone}
      />,
    );
    const field = screen.getByRole("textbox", { name: "Section title" });
    await user.clear(field);
    await user.type(field, "Renamed");
    expect(field).toHaveValue("Renamed");
  });

  it("removes a row when Delete is pressed", async () => {
    const user = userEvent.setup();
    render(
      <ModalHarness
        initialRows={[
          { id: "a", title: "Keep" },
          { id: "b", title: "Gone" },
        ]}
        onCancel={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: "Delete" })[1]!);
    expect(screen.queryByDisplayValue("Gone")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Keep")).toBeInTheDocument();
  });

  it("appends a row when Add section is pressed", async () => {
    const user = userEvent.setup();
    render(
      <ModalHarness
        initialRows={[{ id: "a", title: "Only" }]}
        onCancel={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add section" }));
    const titles = screen.getAllByRole("textbox", { name: "Section title" });
    expect(titles).toHaveLength(2);
    expect(titles[1]).toHaveValue("New section");
  });

  it("disables Move up on the first row", () => {
    render(
      <ModalHarness
        initialRows={[
          { id: "a", title: "First" },
          { id: "b", title: "Second" },
        ]}
        onCancel={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    const moveUpButtons = screen.getAllByRole("button", { name: /Move .* up/ });
    expect(moveUpButtons[0]).toBeDisabled();
    expect(moveUpButtons[1]).not.toBeDisabled();
  });

  it("disables Move down on the last row", () => {
    render(
      <ModalHarness
        initialRows={[
          { id: "a", title: "First" },
          { id: "b", title: "Second" },
        ]}
        onCancel={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    const moveDownButtons = screen.getAllByRole("button", {
      name: /Move .* down/,
    });
    expect(moveDownButtons[0]).not.toBeDisabled();
    expect(moveDownButtons[1]).toBeDisabled();
  });

  it("moves a row down when Move down is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ModalHarness
        initialRows={[
          { id: "a", title: "First" },
          { id: "b", title: "Second" },
        ]}
        onCancel={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    const titles = () =>
      screen
        .getAllByRole("textbox", { name: "Section title" })
        .map((el) => (el as HTMLInputElement).value);
    expect(titles()).toEqual(["First", "Second"]);
    await user.click(screen.getByRole("button", { name: "Move First down" }));
    expect(titles()).toEqual(["Second", "First"]);
  });
});
