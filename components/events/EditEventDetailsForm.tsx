"use client";

import { updateEvent } from "@/app/actions/events";
import { EventWallDatetimeFields } from "@/components/common/EventWallDatetimeFields";
import { useEventWallDatetimeFields } from "@/hooks/use-event-wall-datetime-fields";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type EditEventDetailsFormProps = {
  eventId: string;
  initial: {
    title: string;
    /** Included so we can preserve it; not editable here. */
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

export function EditEventDetailsForm({
  eventId,
  initial,
  onCancel,
  onSaved,
}: EditEventDetailsFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const datetimeFields = useEventWallDatetimeFields({
    mode: "from-event",
    initial,
  });
  return (
    <div
      className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800"
      data-testid="edit-details-form"
    >
      <form
        className="flex w-full flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const title = String(fd.get("title") ?? "");
          const location = String(fd.get("location") ?? "");
          setError(null);

          startTransition(async () => {
            const result = await updateEvent({
              eventId,
              title,
              location: location.trim() || null,
              ...datetimeFields.wallDatetimePayload,
              // Important: preserve existing markdown; not editable here.
              generalInformation: initial.generalInformation ?? null,
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

        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Edit event details
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Edit title, schedule, and location. General information is edited
            separately.
          </p>
        </div>

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
            disabled={isPending}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-400"
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
            disabled={isPending}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-400"
          />
        </div>

        <EventWallDatetimeFields
          startId="edit-event-start"
          endId="edit-event-end"
          disabled={isPending}
          fields={datetimeFields}
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
