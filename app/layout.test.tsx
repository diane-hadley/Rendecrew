import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "./layout";

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-provider">{children}</div>
  ),
}));

describe("RootLayout", () => {
  it("wraps children with ClerkProvider and document shell", () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <RootLayout>
          <span>Child</span>
        </RootLayout>,
      );
    });

    const root = tree.root;
    const clerk = root.findByProps({ "data-testid": "clerk-provider" });
    expect(clerk).toBeTruthy();

    const html = clerk.findByType("html");
    expect(html.props.lang).toBe("en");
    expect(html.props.suppressHydrationWarning).toBe(true);

    const body = html.findByType("body");
    expect(body.props.suppressHydrationWarning).toBe(true);
    expect(body.props.className).toBe("font-inter");

    const span = body.findByType("span");
    expect(span.props.children).toBe("Child");

    tree.unmount();
  });
});
