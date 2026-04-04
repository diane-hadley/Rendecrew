import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

const clerkAuth = vi.hoisted(() => ({ signedIn: false }));

vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    clerkAuth.signedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    !clerkAuth.signedIn ? <>{children}</> : null,
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => <div>User menu</div>,
}));

describe("Home page", () => {
  beforeEach(() => {
    clerkAuth.signedIn = false;
  });

  it("renders marketing copy and sign-in when signed out", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /Rendecrew/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign In to Get Started/i }),
    ).toBeInTheDocument();
  });

  it("shows dashboard link when signed in", () => {
    clerkAuth.signedIn = true;
    render(<Home />);
    expect(screen.getByRole("link", { name: /Go to Dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
