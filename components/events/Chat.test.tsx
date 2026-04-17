import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "./Chat";

const sendEventChatMessage = vi.fn();
vi.mock("@/app/actions/event-chat", () => ({
  sendEventChatMessage: (...args: unknown[]) => sendEventChatMessage(...args),
}));

describe("Chat", () => {
  beforeEach(() => {
    sendEventChatMessage.mockReset();
  });

  it("shows empty-state hint before messages", async () => {
    const user = userEvent.setup();
    render(<Chat eventId="evt-1" />);
    await user.click(
      screen.getByRole("button", { name: /Open event assistant chat/i }),
    );
    expect(
      screen.getByText(/Which items aren't yet signed up/i),
    ).toBeInTheDocument();
  });

  it("appends assistant reply on success", async () => {
    const user = userEvent.setup();
    sendEventChatMessage.mockResolvedValue({
      ok: true as const,
      reply: "The event starts Saturday.",
    });
    render(<Chat eventId="evt-1" />);
    await user.click(
      screen.getByRole("button", { name: /Open event assistant chat/i }),
    );
    const input = screen.getByPlaceholderText(/Ask about this event/i);
    await user.type(input, "When does it start?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("The event starts Saturday."),
    ).toBeInTheDocument();
    expect(screen.getByText("When does it start?")).toBeInTheDocument();
  });

  it("restores input and shows error on failure", async () => {
    const user = userEvent.setup();
    sendEventChatMessage.mockResolvedValue({
      ok: false as const,
      error: "Rate limited",
    });
    render(<Chat eventId="evt-1" />);
    await user.click(
      screen.getByRole("button", { name: /Open event assistant chat/i }),
    );
    const input = screen.getByPlaceholderText(
      /Ask about this event/i,
    ) as HTMLTextAreaElement;
    await user.type(input, "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limited");
    expect(input.value).toBe("Hello");
  });
});
