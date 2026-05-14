import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { useDismissOnOutsidePointer } from "./use-dismiss-on-outside-pointer";

function OutsideHarness() {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutsidePointer(ref, open, setOpen);
  return (
    <div>
      <button type="button" data-testid="outside">
        outside
      </button>
      <div ref={ref} data-testid="panel">
        panel{open ? "" : "-closed"}
      </div>
    </div>
  );
}

function InsideHarness() {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutsidePointer(ref, open, setOpen);
  return (
    <div ref={ref} data-testid="panel">
      <button type="button">inside-btn</button>
      {open ? "open" : "closed"}
    </div>
  );
}

describe("useDismissOnOutsidePointer", () => {
  it("sets open false on pointerdown outside the ref subtree", async () => {
    render(<OutsideHarness />);
    expect(screen.getByTestId("panel")).not.toHaveTextContent("-closed");
    fireEvent.pointerDown(screen.getByTestId("outside"));
    await waitFor(() => {
      expect(screen.getByTestId("panel")).toHaveTextContent("-closed");
    });
  });

  it("does not dismiss when pointerdown target is inside the ref", () => {
    render(<InsideHarness />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "inside-btn" }));
    expect(screen.getByTestId("panel")).toHaveTextContent("open");
  });
});
