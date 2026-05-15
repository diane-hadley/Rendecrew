"use client";

import { updateEvent } from "@/app/actions/events";
import { EventWallDatetimeFields } from "@/components/common/EventWallDatetimeFields";
import { useEventWallDatetimeFields } from "@/hooks/use-event-wall-datetime-fields";
import { GeneralInformationAiPanel } from "./GeneralInformationAiPanel";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

export type EditEventFormProps = {
  eventId: string;
  initial: {
    title: string;
    generalInformation: string | null;
    location: string | null;
    startAt: Date | string | null;
    endAt: Date | string | null;
    startAtTimeZone: string;
    endAtTimeZone: string;
  };
  onCancel?: () => void;
  onSaved?: () => void;
};

export function EditEventForm({
  eventId,
  initial,
  onCancel,
  onSaved,
}: EditEventFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [generalInformation, setGeneralInformation] = useState(
    () => initial.generalInformation ?? "",
  );
  const generalInformationTextareaRef = useRef<HTMLTextAreaElement>(null);

  const datetimeFields = useEventWallDatetimeFields({
    mode: "from-event",
    initial,
  });

  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
      <form
        className="flex w-full flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const title = String(fd.get("title") ?? "");
          const location = String(fd.get("location") ?? "");
          setError(null);

          startTransition(async () => {
            const result = await updateEvent({
              eventId,
              title,
              generalInformation: generalInformation.trim() || null,
              location: location.trim() || null,
              ...datetimeFields.wallDatetimePayload,
            });

            if (!result.ok) {
              setError(result.error);
            } else {
              router.refresh();
              onSaved?.();
            }
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

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-event-title" className="text-sm font-medium">
            Title <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <input
            id="edit-event-title"
            name="title"
            type="text"
            required
            autoComplete="off"
            defaultValue={initial.title}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:ring-blue-400"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-event-location" className="text-sm font-medium">
            Location
          </label>
          <input
            id="edit-event-location"
            name="location"
            type="text"
            autoComplete="off"
            defaultValue={initial.location ?? ""}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:ring-blue-400"
          />
        </div>

        <EventWallDatetimeFields
          startId="edit-event-start"
          endId="edit-event-end"
          disabled={isPending}
          fields={datetimeFields}
        />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="edit-event-general-information"
            className="text-sm font-medium"
          >
            General information
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Markdown is supported (headings, lists, links, tables). Use this for
            itinerary, themed nights, important links, and anything participants
            should read first.
          </p>
          <textarea
            id="edit-event-general-information"
            ref={generalInformationTextareaRef}
            name="generalInformation"
            rows={14}
            value={generalInformation}
            onChange={(e) => setGeneralInformation(e.target.value)}
            className="min-h-48 resize-y rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:ring-blue-400"
            placeholder={`## Itinerary\n- **Friday** — Arrive after 4pm…`}
          />
        </div>

        <GeneralInformationAiPanel
          eventId={eventId}
          getCurrentMarkdown={() => generalInformation}
          onApplyMarkdown={(markdown) => {
            setGeneralInformation(markdown);
            requestAnimationFrame(() => {
              generalInformationTextareaRef.current?.focus();
            });
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-800"
          >
            {isPending ? "Saving…" : "Save changes"}
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
