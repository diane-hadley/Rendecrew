import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventDisplayCard } from "./EventDisplayCard";

describe("EventDisplayCard", () => {
  it("renders role badge and date range", () => {
    render(
      <EventDisplayCard
        role="creator"
        dateRangeLabel="Jun 1 – Jun 3, 2026"
        location={null}
        generalInformation={null}
      />,
    );
    expect(screen.getByText("creator")).toBeInTheDocument();
    expect(screen.getByText("Jun 1 – Jun 3, 2026")).toBeInTheDocument();
  });

  it("shows empty general information message when none is provided", () => {
    render(
      <EventDisplayCard
        role="guest"
        dateRangeLabel="Soon"
        location={null}
        generalInformation={null}
      />,
    );
    expect(
      screen.getByRole("region", { name: "General information" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No general information yet.")).toBeInTheDocument();
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
      screen.getByRole("region", { name: "General information" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Park")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Schedule", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Friday")).toBeInTheDocument();
  });
});
