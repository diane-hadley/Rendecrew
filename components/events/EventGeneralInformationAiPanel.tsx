"use client";

import { assistEventGeneralInformation } from "@/app/actions/event-general-information-ai";
import { useState, useTransition } from "react";

export function EventGeneralInformationAiPanel({
  eventId,
  getCurrentMarkdown,
  onApplyMarkdown,
}: {
  eventId: string;
  getCurrentMarkdown: () => string;
  onApplyMarkdown: (markdown: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/80 p-4 dark:border-violet-900 dark:bg-violet-950/30">
      <p className="mb-2 text-sm font-medium text-violet-900 dark:text-violet-200">
        AI assistant
      </p>
      <p className="mb-3 text-xs text-violet-800/90 dark:text-violet-300/90">
        Describe what you want in this section (for example: a weekend
        itinerary, themed dinner nights, or parking notes). The assistant uses
        your current draft and the event&apos;s title, dates, and location.
      </p>
      <label htmlFor={`event-gi-ai-${eventId}`} className="sr-only">
        Instructions for the AI assistant
      </label>
      <textarea
        id={`event-gi-ai-${eventId}`}
        rows={3}
        value={instruction}
        disabled={isPending}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder='e.g. Add a day-by-day itinerary and a "80s night" on Saturday.'
        className="mb-3 w-full resize-y rounded-md border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60 dark:border-violet-800 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-violet-400"
      />
      {error && (
        <p
          className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => {
          setError(null);
          const trimmedInstruction = instruction.trim();
          if (!trimmedInstruction) {
            setError("Describe what you want the assistant to write");
            return;
          }
          startTransition(async () => {
            const result = await assistEventGeneralInformation(eventId, {
              currentMarkdown: getCurrentMarkdown(),
              instruction: trimmedInstruction,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onApplyMarkdown(result.markdown);
            setInstruction("");
          });
        }}
        className="inline-flex items-center justify-center rounded-md bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-900"
      >
        {isPending ? "Working…" : "Generate into draft"}
      </button>
    </div>
  );
}
