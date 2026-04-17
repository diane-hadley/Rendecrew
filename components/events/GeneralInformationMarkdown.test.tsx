import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GeneralInformationMarkdown } from "./GeneralInformationMarkdown";

describe("GeneralInformationMarkdown", () => {
  it("renders rich markdown including GFM table and fenced code", () => {
    const md = [
      "# Title",
      "## Subtitle",
      "### Detail",
      "Paragraph with **bold** and *italic*.",
      "",
      "- bullet one",
      "- bullet two",
      "",
      "1. first",
      "2. second",
      "",
      "[Example](https://example.com/path)",
      "",
      "> quoted",
      "",
      "---",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "Inline `code` here.",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");

    render(<GeneralInformationMarkdown markdown={md} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Subtitle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Detail" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Example" })).toHaveAttribute(
      "href",
      "https://example.com/path",
    );
    expect(screen.getByRole("link", { name: "Example" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByText("quoted")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });

  it("renders nothing harmful for empty markdown", () => {
    const { container } = render(<GeneralInformationMarkdown markdown="" />);
    expect(container.querySelector(".max-w-none")).toBeInTheDocument();
  });
});
