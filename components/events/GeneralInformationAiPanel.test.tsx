import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralInformationAiPanel } from "./GeneralInformationAiPanel";

const assistEventGeneralInformation = vi.fn();
vi.mock("@/app/actions/event-general-information-ai", () => ({
  assistEventGeneralInformation: (...args: unknown[]) =>
    assistEventGeneralInformation(...args),
}));

describe("GeneralInformationAiPanel", () => {
  beforeEach(() => {
    assistEventGeneralInformation.mockReset();
  });

  it("shows validation when instruction is empty", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <GeneralInformationAiPanel
        eventId="ev-1"
        getCurrentMarkdown={() => "## draft"}
        onApplyMarkdown={onApply}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Generate into draft/i }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Describe what you want the assistant to write",
    );
    expect(assistEventGeneralInformation).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("calls assist and applies markdown on success", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    let draft = "start";
    assistEventGeneralInformation.mockResolvedValue({
      ok: true as const,
      markdown: "## updated",
    });
    render(
      <GeneralInformationAiPanel
        eventId="ev-1"
        getCurrentMarkdown={() => draft}
        onApplyMarkdown={(md) => {
          draft = md;
          onApply(md);
        }}
      />,
    );
    await user.type(
      screen.getByPlaceholderText(/day-by-day itinerary/i),
      "Add parking section",
    );
    await user.click(
      screen.getByRole("button", { name: /Generate into draft/i }),
    );
    await vi.waitFor(() => {
      expect(assistEventGeneralInformation).toHaveBeenCalledWith("ev-1", {
        currentMarkdown: "start",
        instruction: "Add parking section",
      });
      expect(onApply).toHaveBeenCalledWith("## updated");
    });
    expect(screen.getByPlaceholderText(/day-by-day itinerary/i)).toHaveValue(
      "",
    );
  });

  it("shows server error when assist fails", async () => {
    const user = userEvent.setup();
    assistEventGeneralInformation.mockResolvedValue({
      ok: false as const,
      error: "Rate limited",
    });
    render(
      <GeneralInformationAiPanel
        eventId="ev-1"
        getCurrentMarkdown={() => ""}
        onApplyMarkdown={() => {}}
      />,
    );
    await user.type(
      screen.getByPlaceholderText(/day-by-day itinerary/i),
      "Do something",
    );
    await user.click(
      screen.getByRole("button", { name: /Generate into draft/i }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limited");
  });
});
