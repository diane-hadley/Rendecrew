import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyEventPackingCommitments } from "./MyEventPackingCommitments";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const setMyPackingSignUpPacked = vi.fn();
vi.mock("@/app/actions/packing-list", () => ({
  setMyPackingSignUpPacked: (...args: unknown[]) =>
    setMyPackingSignUpPacked(...args),
}));

describe("MyEventPackingCommitments", () => {
  beforeEach(() => {
    refresh.mockClear();
    setMyPackingSignUpPacked.mockReset();
  });

  it("returns null without packingListPath", () => {
    const { container } = render(
      <MyEventPackingCommitments
        eventId="e1"
        commitments={[]}
        packingListPath={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists commitments and quantity", () => {
    render(
      <MyEventPackingCommitments
        eventId="e1"
        packingListPath="/p"
        commitments={[
          {
            signUpId: "s1",
            itemName: "Tent",
            signUpQuantity: 2,
            signUpPacked: false,
          },
        ]}
      />,
    );
    expect(screen.getByText("Tent")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows open list link by default", () => {
    render(
      <MyEventPackingCommitments
        eventId="e1"
        packingListPath="/packing/x"
        commitments={[]}
      />,
    );
    const link = screen.getByRole("link", {
      name: /Open collaborative packing list/i,
    });
    expect(link).toHaveAttribute("href", "/packing/x");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("hides open list when showOpenListLink is false", () => {
    render(
      <MyEventPackingCommitments
        eventId="e1"
        packingListPath="/packing/x"
        commitments={[]}
        showOpenListLink={false}
      />,
    );
    expect(
      screen.queryByRole("link", { name: /Open collaborative packing list/i }),
    ).not.toBeInTheDocument();
  });

  it("calls action and refreshes when checkbox toggled", async () => {
    const user = userEvent.setup();
    setMyPackingSignUpPacked.mockResolvedValue({ ok: true as const });
    render(
      <MyEventPackingCommitments
        eventId="e1"
        packingListPath="/p"
        commitments={[
          {
            signUpId: "s1",
            itemName: "Cooler",
            signUpQuantity: null,
            signUpPacked: false,
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: /Packed: Cooler/i }));
    await vi.waitFor(() => {
      expect(setMyPackingSignUpPacked).toHaveBeenCalledWith("e1", "s1", true);
      expect(refresh).toHaveBeenCalled();
    });
  });
});
