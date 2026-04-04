import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("@/components/events/CreateEventForm", () => ({
  CreateEventForm: () => <div data-testid="create-form">Create form</div>,
}));
vi.mock("@/components/events/DescribeEventForm", () => ({
  DescribeEventForm: () => <div data-testid="describe-form">Describe form</div>,
}));
vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div>UserButton</div>,
}));

import { currentUser } from "@clerk/nextjs/server";
import NewEventPage from "./page";

describe("NewEventPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects when not signed in", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    await expect(NewEventPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("renders both event creation flows when signed in", async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: "c1" } as Awaited<
      ReturnType<typeof currentUser>
    >);
    const ui = await NewEventPage();
    render(ui);
    expect(
      screen.getByRole("heading", { name: /Create New Event/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("describe-form")).toBeInTheDocument();
    expect(screen.getByTestId("create-form")).toBeInTheDocument();
  });
});
