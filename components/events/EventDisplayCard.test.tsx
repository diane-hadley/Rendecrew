import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventDisplayCard } from "./EventDisplayCard";

describe("EventDisplayCard", () => {
  it("renders role badge and date range", () => {
    render(
      <EventDisplayCard
        role="organizer"
        dateRangeLabel="Jun 1 – Jun 3, 2026"
        location={null}
        generalInformation={null}
      />,
    );
    expect(screen.getByText("organizer")).toBeInTheDocument();
    expect(screen.getByText("Jun 1 – Jun 3, 2026")).toBeInTheDocument();
  });

  it("omits the general information block when none is provided", () => {
    render(
      <EventDisplayCard
        role="guest"
        dateRangeLabel="Soon"
        location={null}
        generalInformation={null}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Event information" }),
    ).not.toBeInTheDocument();
  });

  it("shows location and renders markdown general information", () => {
    render(
      <EventDisplayCard
        role="guest"
        dateRangeLabel="Soon"
        location="Park"
        generalInformation={"## Schedule\n\n- **Friday** — Arrive"}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Event information" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Park")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Schedule", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Friday")).toBeInTheDocument();
  });
});
