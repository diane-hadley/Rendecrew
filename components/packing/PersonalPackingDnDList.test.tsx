import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  deletePersonalPackingItem,
  reorderPersonalPackingItems,
  updatePersonalPackingItem,
} from "@/app/actions/packing-advanced";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalItemVM } from "@/lib/personal-packing-sections";
import { PersonalPackingDnDList } from "./PersonalPackingDnDList";

vi.mock("@/app/actions/packing-advanced", () => ({
  updatePersonalPackingItem: vi.fn().mockResolvedValue({ ok: true }),
  deletePersonalPackingItem: vi.fn().mockResolvedValue({ ok: true }),
  reorderPersonalPackingItems: vi.fn().mockResolvedValue({ ok: true }),
}));

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updatePersonalPackingItem).mockResolvedValue({ ok: true });
  vi.mocked(deletePersonalPackingItem).mockResolvedValue({ ok: true });
  vi.mocked(reorderPersonalPackingItems).mockResolvedValue({ ok: true });
});

describe("PersonalPackingDnDList", () => {
  it("shows empty copy when there are no personal items", () => {
    render(
      <PersonalPackingDnDList
        eventId="e1"
        personalItems={[]}
        sharedSectionTitles={[]}
        onServerError={vi.fn()}
      />,
    );
    expect(screen.getByText("No personal rows yet.")).toBeInTheDocument();
  });

  it("renders uncategorized heading and item labels", () => {
    render(
      <PersonalPackingDnDList
        eventId="e1"
        personalItems={[
          item({ id: "p1", name: "Soap", section: null, sortOrder: 0 }),
        ]}
        sharedSectionTitles={[]}
        onServerError={vi.fn()}
      />,
    );
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
    expect(screen.getByText("Soap")).toBeInTheDocument();
  });

  it("renders a named section heading from shared titles", () => {
    render(
      <PersonalPackingDnDList
        eventId="e1"
        personalItems={[
          item({ id: "p1", name: "Knife", section: "Kitchen", sortOrder: 0 }),
        ]}
        sharedSectionTitles={["Kitchen"]}
        onServerError={vi.fn()}
      />,
    );
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Knife")).toBeInTheDocument();
  });

  it("persists packed state when the checkbox is toggled", async () => {
    const user = userEvent.setup();
    render(
      <PersonalPackingDnDList
        eventId="e1"
        personalItems={[
          item({
            id: "p1",
            name: "Mug",
            section: null,
            packed: false,
            sortOrder: 0,
          }),
        ]}
        sharedSectionTitles={[]}
        onServerError={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText(/Packed: Mug/i));
    await waitFor(() => {
      expect(updatePersonalPackingItem).toHaveBeenCalledWith("p1", {
        packed: true,
      });
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("deletes an item when Delete is pressed", async () => {
    const user = userEvent.setup();
    render(
      <PersonalPackingDnDList
        eventId="e1"
        personalItems={[item({ id: "p9", name: "Temp", section: null })]}
        sharedSectionTitles={[]}
        onServerError={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deletePersonalPackingItem).toHaveBeenCalledWith("p9");
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("opens the edit-sections modal and closes on Cancel", async () => {
    const user = userEvent.setup();
    render(
      <PersonalPackingDnDList
        eventId="e1"
        personalItems={[
          item({ id: "a", name: "x", section: "Gear", sortOrder: 0 }),
        ]}
        sharedSectionTitles={["Gear"]}
        onServerError={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit sections" }));
    expect(
      screen.getByRole("heading", { name: "Edit sections" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("heading", { name: "Edit sections" }),
    ).not.toBeInTheDocument();
  });

  it("calls reorder when Done is pressed in the section editor without changes", async () => {
    const user = userEvent.setup();
    render(
      <PersonalPackingDnDList
        eventId="e1"
        personalItems={[
          item({ id: "a", name: "Hat", section: "Gear", sortOrder: 0 }),
        ]}
        sharedSectionTitles={["Gear"]}
        onServerError={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit sections" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(reorderPersonalPackingItems).toHaveBeenCalled();
    });
    const call = vi.mocked(reorderPersonalPackingItems).mock.calls[0];
    expect(call[0]).toBe("e1");
    expect(call[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "a", section: "Gear" }),
      ]),
    );
  });

  it("invokes onServerError when reorder returns not ok", async () => {
    const user = userEvent.setup();
    const onServerError = vi.fn();
    vi.mocked(reorderPersonalPackingItems).mockResolvedValue({
      ok: false,
      error: "nope",
    });
    render(
      <PersonalPackingDnDList
        eventId="e1"
        personalItems={[
          item({ id: "a", name: "Hat", section: "Gear", sortOrder: 0 }),
        ]}
        sharedSectionTitles={["Gear"]}
        onServerError={onServerError}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit sections" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(onServerError).toHaveBeenCalledWith("nope");
    });
  });
});
