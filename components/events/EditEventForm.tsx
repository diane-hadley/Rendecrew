"use client";

import { updateEvent } from "@/app/actions/events";
import { EventDateTimeFields } from "./EventDateTimeFields";
import {
  isoToDatetimeLocal,
  normalizeStartEndPair,
  shouldSyncEndToStart,
} from "@/lib/datetime-local";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export type EditEventFormProps = {
  eventId: string;
  initial: {
    title: string;
    description: string | null;
    location: string | null;
    startAt: Date | string | null;
    endAt: Date | string | null;
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

  const initialPair = useMemo(() => {
    const start = isoToDatetimeLocal(
      initial.startAt != null ? String(initial.startAt) : null,
    );
    const end = isoToDatetimeLocal(
      initial.endAt != null ? String(initial.endAt) : null,
    );
    return normalizeStartEndPair(start, end);
  }, [initial.startAt, initial.endAt]);

  const [startAt, setStartAt] = useState(initialPair.start);
  const [endAt, setEndAt] = useState(initialPair.end);

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <form
        className="flex w-full flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const title = String(fd.get("title") ?? "");
          const description = String(fd.get("description") ?? "");
          const location = String(fd.get("location") ?? "");

          setError(null);

          startTransition(async () => {
            const result = await updateEvent({
              eventId,
              title,
              description: description.trim() || null,
              location: location.trim() || null,
              startAt,
              endAt,
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
            className="text-sm text-red-700 dark:text-red-400 rounded-md bg-red-50 dark:bg-red-950/50 px-3 py-2 border border-red-200 dark:border-red-900"
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
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="edit-event-description"
            className="text-sm font-medium"
          >
            Description
          </label>
          <textarea
            id="edit-event-description"
            name="description"
            rows={3}
            defaultValue={initial.description ?? ""}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-y min-h-[5rem]"
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
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          <EventDateTimeFields
            id="edit-event-start"
            label="Start"
            value={startAt}
            onChange={(next) => {
              setStartAt(next);
              setEndAt((prev) =>
                shouldSyncEndToStart(next, prev) ? next : prev,
              );
            }}
          />
          <EventDateTimeFields
            id="edit-event-end"
            label="End"
            value={endAt}
            onChange={setEndAt}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          {onCancel && (
            <button
              type="button"
              disabled={isPending}
              onClick={onCancel}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
