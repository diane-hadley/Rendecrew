import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  copySuggestionToPersonal,
  createPersonalPackingItem,
  deletePersonalPackingItem,
  moderatePackingSuggestion,
  suggestPackingItem,
  updatePersonalPackingItem,
} from "@/app/actions/packing-advanced";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  vi.mocked(moderatePackingSuggestion).mockResolvedValue({ ok: true });
  vi.mocked(suggestPackingItem).mockResolvedValue({ ok: true });
  vi.mocked(copySuggestionToPersonal).mockResolvedValue({ ok: true });
  vi.mocked(createPersonalPackingItem).mockResolvedValue({ ok: true });
  vi.mocked(updatePersonalPackingItem).mockResolvedValue({ ok: true });
  vi.mocked(deletePersonalPackingItem).mockResolvedValue({ ok: true });
});

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
    expect(screen.getByText(/need admin approval/i)).toBeInTheDocument();
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

  it("rejects a draft suggestion", async () => {
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
            id: "d2",
            name: "Tent",
            section: null,
            defaultQuantity: null,
            createdByName: "Bo",
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(vi.mocked(moderatePackingSuggestion)).toHaveBeenCalledWith(
      "d2",
      "reject",
    );
  });

  it("shows catalog sign-in hint when anonymous", () => {
    render(
      <PackingSuggestionsTab
        eventId="e1"
        isSignedIn={false}
        canManageTemplate={false}
        suggestionApprovalRequired={false}
        published={[]}
        drafts={[]}
      />,
    );
    expect(
      screen.getByText(/Sign in to suggest items for the catalog/i),
    ).toBeInTheDocument();
    expect(screen.getByText("No suggestions yet.")).toBeInTheDocument();
  });

  it("submits a suggestion with optional fields", async () => {
    const user = userEvent.setup();
    render(
      <PackingSuggestionsTab
        eventId="e1"
        isSignedIn
        canManageTemplate={false}
        suggestionApprovalRequired={false}
        published={[]}
        drafts={[]}
      />,
    );
    await user.type(screen.getByPlaceholderText("Item name"), "Napkins");
    await user.type(
      screen.getByPlaceholderText("Section (optional)"),
      "Picnic",
    );
    await user.type(
      screen.getByPlaceholderText("Default quantity (optional)"),
      "3",
    );
    await user.click(
      screen.getByRole("button", { name: /Submit suggestion/i }),
    );
    await waitFor(() => {
      expect(vi.mocked(suggestPackingItem)).toHaveBeenCalledWith("e1", {
        name: "Napkins",
        section: "Picnic",
        defaultQuantity: 3,
      });
    });
  });

  it("copies a published suggestion and shows New badge", async () => {
    const user = userEvent.setup();
    render(
      <PackingSuggestionsTab
        eventId="e1"
        isSignedIn
        canManageTemplate={false}
        suggestionApprovalRequired={false}
        published={[
          {
            id: "pub1",
            name: "Ice",
            section: "Cooler",
            defaultQuantity: 1,
            createdAt: "2026-01-01",
            isNew: true,
            alreadyCopied: false,
          },
        ]}
        drafts={[]}
      />,
    );
    expect(screen.getByText("New")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Copy to my list/i }));
    expect(vi.mocked(copySuggestionToPersonal)).toHaveBeenCalledWith("pub1");
  });

  it("disables copy when suggestion already on list", () => {
    render(
      <PackingSuggestionsTab
        eventId="e1"
        isSignedIn
        canManageTemplate={false}
        suggestionApprovalRequired={false}
        published={[
          {
            id: "pub2",
            name: "Cups",
            section: null,
            defaultQuantity: null,
            createdAt: "2026-01-02",
            isNew: false,
            alreadyCopied: true,
          },
        ]}
        drafts={[]}
      />,
    );
    expect(
      screen.getByRole("button", { name: /On your list/i }),
    ).toBeDisabled();
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

  it("shows empty state for commitments and personal list", () => {
    render(
      <PackingMyPackingTab
        eventId="e1"
        isSignedIn
        commitments={[]}
        personalItems={[]}
      />,
    );
    expect(
      screen.getByText(/No sign-ups linked to your account/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/No personal rows yet/i)).toBeInTheDocument();
  });

  it("adds a personal item from the form", async () => {
    const user = userEvent.setup();
    render(
      <PackingMyPackingTab
        eventId="e1"
        isSignedIn
        commitments={[]}
        personalItems={[]}
      />,
    );
    await user.type(screen.getByPlaceholderText("Add personal item"), "Towel");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(vi.mocked(createPersonalPackingItem)).toHaveBeenCalledWith("e1", {
        name: "Towel",
        section: null,
        quantity: 1,
      });
    });
  });

  it("updates packed state from checkbox", async () => {
    const user = userEvent.setup();
    render(
      <PackingMyPackingTab
        eventId="e1"
        isSignedIn
        commitments={[]}
        personalItems={[
          {
            id: "p2",
            name: "Hat",
            section: "Gear",
            quantity: 2,
            packed: false,
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(vi.mocked(updatePersonalPackingItem)).toHaveBeenCalledWith("p2", {
        packed: true,
      });
    });
  });

  it("updates quantity on blur when value changes", async () => {
    const user = userEvent.setup();
    render(
      <PackingMyPackingTab
        eventId="e1"
        isSignedIn
        commitments={[]}
        personalItems={[
          {
            id: "p3",
            name: "Snacks",
            section: null,
            quantity: 2,
            packed: true,
          },
        ]}
      />,
    );
    const qty = screen.getByLabelText("Quantity");
    await user.clear(qty);
    await user.type(qty, "5");
    await user.tab();
    await waitFor(() => {
      expect(vi.mocked(updatePersonalPackingItem)).toHaveBeenCalledWith("p3", {
        quantity: 5,
      });
    });
  });
});
