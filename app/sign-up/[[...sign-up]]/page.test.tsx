import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SignUpPage from "./page";

vi.mock("@clerk/nextjs", () => ({
  SignUp: () => <div data-testid="clerk-sign-up">Clerk SignUp</div>,
}));

describe("SignUpPage", () => {
  it("renders Clerk SignUp", () => {
    render(<SignUpPage />);
    expect(screen.getByTestId("clerk-sign-up")).toBeInTheDocument();
  });
});
