import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  deletePersonalPackingItem,
  moderatePackingSuggestion,
} from "@/app/actions/packing-advanced";
import { describe, expect, it, vi } from "vitest";
import {
  PackingMyPackingTab,
  PackingSuggestionsTab,
  PackingTabBar,
} from "./PackingAdvancedViews";

vi.mock("@/app/actions/packing-advanced", () => ({
  moderatePackingSuggestion: vi.fn().mockResolvedValue({ ok: true }),
  suggestPackingItem: vi.fn().mockResolvedValue({ ok: true }),
  copySuggestionToPersonal: vi.fn().mockResolvedValue({ ok: true }),
  createPersonalPackingItem: vi.fn().mockResolvedValue({ ok: true }),
  updatePersonalPackingItem: vi.fn().mockResolvedValue({ ok: true }),
  deletePersonalPackingItem: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("PackingTabBar", () => {
  it("notifies parent when tabs change", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PackingTabBar active="shared" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Suggestions" }));
    expect(onChange).toHaveBeenCalledWith("suggestions");
    await user.click(screen.getByRole("button", { name: "My packing" }));
    expect(onChange).toHaveBeenCalledWith("my");
    await user.click(screen.getByRole("button", { name: "Shared list" }));
    expect(onChange).toHaveBeenCalledWith("shared");
  });
});

describe("PackingSuggestionsTab", () => {
  it("shows approval copy when required", () => {
    render(
      <PackingSuggestionsTab
        eventId="e1"
        isSignedIn={false}
        canManageTemplate={false}
        suggestionApprovalRequired
        published={[]}
        drafts={[]}
      />,
    );
    expect(screen.getByText(/need organizer approval/i)).toBeInTheDocument();
  });

  it("renders draft moderation for managers", async () => {
    const user = userEvent.setup();
    render(
      <PackingSuggestionsTab
        eventId="e1"
        isSignedIn
        canManageTemplate
        suggestionApprovalRequired={false}
        published={[]}
        drafts={[
          {
            id: "d1",
            name: "Cooler",
            section: "Kitchen",
            defaultQuantity: 2,
            createdByName: "Alex",
          },
        ]}
      />,
    );
    expect(screen.getByText("Cooler")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(vi.mocked(moderatePackingSuggestion)).toHaveBeenCalledWith(
      "d1",
      "publish",
    );
  });
});

describe("PackingMyPackingTab", () => {
  it("prompts sign-in when anonymous", () => {
    render(
      <PackingMyPackingTab
        eventId="e1"
        isSignedIn={false}
        commitments={[]}
        personalItems={[]}
      />,
    );
    expect(
      screen.getByText(/Sign in to maintain a personal checklist/i),
    ).toBeInTheDocument();
  });

  it("lists commitments and personal rows", async () => {
    const user = userEvent.setup();
    render(
      <PackingMyPackingTab
        eventId="e1"
        isSignedIn
        commitments={[
          {
            signUpId: "su1",
            itemId: "i1",
            itemName: "Plates",
            itemQuantity: 10,
            signUpQuantity: 2,
            signUpPacked: false,
          },
        ]}
        personalItems={[
          {
            id: "p1",
            name: "Sunscreen",
            section: null,
            quantity: 1,
            packed: false,
          },
        ]}
      />,
    );
    expect(screen.getByText("Plates")).toBeInTheDocument();
    expect(screen.getByText("Sunscreen")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(vi.mocked(deletePersonalPackingItem)).toHaveBeenCalledWith("p1");
    });
  });
});
