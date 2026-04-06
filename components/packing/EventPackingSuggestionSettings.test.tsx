import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EventPackingSuggestionSettings } from "./EventPackingSuggestionSettings";

const { setSuggestionApprovalRequired } = vi.hoisted(() => ({
  setSuggestionApprovalRequired: vi.fn(),
}));

vi.mock("@/app/actions/packing-advanced", () => ({
  setSuggestionApprovalRequired,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("EventPackingSuggestionSettings", () => {
  it("toggles approval and refreshes on success", async () => {
    const user = userEvent.setup();
    setSuggestionApprovalRequired.mockResolvedValue({ ok: true });
    render(
      <EventPackingSuggestionSettings
        eventId="ev1"
        approvalRequired={false}
        packingListPath="/packing/room"
        pendingDraftCount={0}
      />,
    );

    const box = screen.getByRole("checkbox");
    expect(box).not.toBeChecked();
    await user.click(box);
    await waitFor(() => {
      expect(setSuggestionApprovalRequired).toHaveBeenCalledWith("ev1", true);
    });
  });

  it("shows review link when drafts pending", () => {
    render(
      <EventPackingSuggestionSettings
        eventId="ev1"
        approvalRequired
        packingListPath="/packing/room"
        pendingDraftCount={2}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Review 2 pending suggestions/i }),
    ).toHaveAttribute("href", "/packing/room?tab=suggestions");
  });
});
