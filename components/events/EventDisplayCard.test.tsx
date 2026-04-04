import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventDisplayCard } from "./EventDisplayCard";

describe("EventDisplayCard", () => {
  it("renders title, role badge, and date range", () => {
    render(
      <EventDisplayCard
        title="Camping trip"
        role="organizer"
        dateRangeLabel="Jun 1 – Jun 3, 2026"
        location={null}
        description={null}
      />,
    );
    expect(screen.getByRole("heading", { name: "Camping trip" })).toBeInTheDocument();
    expect(screen.getByText("organizer")).toBeInTheDocument();
    expect(screen.getByText("Jun 1 – Jun 3, 2026")).toBeInTheDocument();
  });

  it("omits location and description when null", () => {
    render(
      <EventDisplayCard
        title="T"
        role="guest"
        dateRangeLabel="Soon"
        location={null}
        description={null}
      />,
    );
    expect(screen.queryByText(/location/i)).not.toBeInTheDocument();
  });

  it("shows location and description when provided", () => {
    const { container } = render(
      <EventDisplayCard
        title="T"
        role="guest"
        dateRangeLabel="Soon"
        location="Park"
        description={"Line one\nLine two"}
      />,
    );
    expect(screen.getByText("Park")).toBeInTheDocument();
    const desc = container.querySelector(".whitespace-pre-wrap");
    expect(desc?.textContent).toMatch(/Line one\s+Line two/);
  });

  it("renders headerRight when passed", () => {
    render(
      <EventDisplayCard
        title="T"
        role="guest"
        dateRangeLabel="Soon"
        location={null}
        description={null}
        headerRight={<button type="button">Settings</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });
});
