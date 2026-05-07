import { PackingListVisibility } from "@prisma/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackingListPanel } from "./PackingListPanel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const enablePackingListForEvent = vi.fn();
vi.mock("@/app/actions/packing-list", () => ({
  enablePackingListForEvent: (...args: unknown[]) =>
    enablePackingListForEvent(...args),
}));

describe("PackingListPanel", () => {
  beforeEach(() => {
    refresh.mockClear();
    enablePackingListForEvent.mockReset();
  });

  it("shows enable button when room id is missing", async () => {
    const user = userEvent.setup();
    enablePackingListForEvent.mockResolvedValue({ ok: true as const });
    render(
      <PackingListPanel
        eventId="e1"
        liveblocksRoomId={null}
        packingListVisibility={PackingListVisibility.URL_PUBLIC}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Enable packing list/i }),
    );
    await vi.waitFor(() => {
      expect(enablePackingListForEvent).toHaveBeenCalledWith("e1");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("shows error when enable fails", async () => {
    const user = userEvent.setup();
    enablePackingListForEvent.mockResolvedValue({
      ok: false as const,
      error: "No permission",
    });
    render(
      <PackingListPanel
        eventId="e1"
        liveblocksRoomId={null}
        packingListVisibility={PackingListVisibility.URL_PUBLIC}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Enable packing list/i }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("No permission");
  });

  it("shows share path and open link when room exists", () => {
    render(
      <PackingListPanel
        eventId="e1"
        liveblocksRoomId="room-abc"
        packingListVisibility={PackingListVisibility.URL_PUBLIC}
      />,
    );
    expect(screen.getByText(/\/packing\/room-abc/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open list/i })).toHaveAttribute(
      "href",
      "/packing/room-abc",
    );
  });

  it("hides open link when list is members-only", () => {
    const { container } = render(
      <PackingListPanel
        eventId="e1"
        liveblocksRoomId="room-abc"
        packingListVisibility={PackingListVisibility.MEMBERS_ONLY}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("copies full URL to clipboard when origin is set", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <PackingListPanel
        eventId="e1"
        liveblocksRoomId="r1"
        packingListVisibility={PackingListVisibility.URL_PUBLIC}
      />,
    );

    await vi.waitFor(() => {
      expect(
        screen.getByText(new RegExp(`${window.location.origin}/packing/r1`)),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Copy link/i }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/packing/r1`,
    );
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });
});
