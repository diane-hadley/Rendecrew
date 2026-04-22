"use client";

import { updateEventGeneralInformation } from "@/app/actions/event-general-information";
import { GeneralInformationAiPanel } from "./GeneralInformationAiPanel";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

export function EditGeneralInformationForm({
  eventId,
  initialMarkdown,
  onCancel,
  onSaved,
}: {
  eventId: string;
  initialMarkdown: string | null;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [generalInformation, setGeneralInformation] = useState(
    () => initialMarkdown ?? "",
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div
      className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800"
      data-testid="edit-gi-form"
    >
      <form
        className="flex w-full flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await updateEventGeneralInformation({
              eventId,
              generalInformation: generalInformation.trim() || null,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
            onSaved?.();
          });
        }}
      >
        {error && (
          <p
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Edit general information
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Markdown is supported (headings, lists, links, tables). This only
              changes what appears in the General information panel.
            </p>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          name="generalInformation"
          rows={14}
          value={generalInformation}
          onChange={(e) => setGeneralInformation(e.target.value)}
          className="min-h-48 resize-y rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-400"
          placeholder={`## Itinerary\n- **Friday** — Arrive after 4pm…`}
          disabled={isPending}
        />

        <GeneralInformationAiPanel
          eventId={eventId}
          getCurrentMarkdown={() => generalInformation}
          onApplyMarkdown={(markdown) => {
            setGeneralInformation(markdown);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-800"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          {onCancel && (
            <button
              type="button"
              disabled={isPending}
              onClick={onCancel}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:ring-blue-400"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
