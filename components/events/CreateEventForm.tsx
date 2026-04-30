"use client";

import { createEvent } from "@/app/actions/events";
import { DateTimeFields } from "@/components/common/DateTimeFields";
import { TimeZonePickerModal } from "@/components/common/TimeZonePickerModal";
import { APP_DEFAULT_TIME_ZONE, normalizeTimeZone } from "@/lib/event-datetime";
import { shouldSyncEndToStart } from "@/lib/datetime-local";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

export type CreateEventFormProps = {
  /** IANA zone from the signed-in user's profile — default for this form. */
  defaultTimeZone: string;
};

export function CreateEventForm({ defaultTimeZone }: CreateEventFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [startTz, setStartTz] = useState(() =>
    normalizeTimeZone(defaultTimeZone, APP_DEFAULT_TIME_ZONE),
  );
  const [endTz, setEndTz] = useState(() =>
    normalizeTimeZone(defaultTimeZone, APP_DEFAULT_TIME_ZONE),
  );
  const [useSeparateEndTz, setUseSeparateEndTz] = useState(false);
  const [tzModalOpen, setTzModalOpen] = useState(false);

  useEffect(() => {
    const normalized = normalizeTimeZone(
      defaultTimeZone,
      APP_DEFAULT_TIME_ZONE,
    );
    setStartTz(normalized);
    setEndTz(normalized);
  }, [defaultTimeZone]);

  return (
    <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
      <form
        className="flex w-full max-w-4xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const title = String(fd.get("title") ?? "");
          const generalInformation = String(fd.get("generalInformation") ?? "");
          const location = String(fd.get("location") ?? "");

          setError(null);

          startTransition(async () => {
            const result = await createEvent({
              title,
              generalInformation: generalInformation.trim() || null,
              location: location.trim() || null,
              startAt,
              endAt,
              startAtTimeZone: startTz,
              endAtTimeZone: useSeparateEndTz ? endTz : startTz,
            });

            if (!result.ok) {
              setError(result.error);
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
          <label htmlFor="event-title" className="text-sm font-medium">
            Title <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <input
            id="event-title"
            name="title"
            type="text"
            required
            autoComplete="off"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:ring-blue-400"
            placeholder="e.g. Labor Day camping trip"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="event-general-information"
            className="text-sm font-medium"
          >
            General information
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Optional Markdown (itinerary, themes, links). You can expand this
            later on the event page.
          </p>
          <textarea
            id="event-general-information"
            name="generalInformation"
            rows={5}
            className="min-h-24 resize-y rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:ring-blue-400"
            placeholder="Optional"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="event-location" className="text-sm font-medium">
            Location
          </label>
          <input
            id="event-location"
            name="location"
            type="text"
            autoComplete="off"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:focus:ring-blue-400"
            placeholder="Optional"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          <DateTimeFields
            id="event-start"
            label="Start"
            value={startAt}
            onChange={(next) => {
              setStartAt(next);
              setEndAt((prev) =>
                shouldSyncEndToStart(next, prev) ? next : prev,
              );
            }}
          />
          <DateTimeFields
            id="event-end"
            label="End"
            value={endAt}
            onChange={setEndAt}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setTzModalOpen(true)}
            className="font-medium text-blue-600 hover:text-blue-800 disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Time zone
          </button>
          <span className="text-gray-600 dark:text-gray-300">
            {useSeparateEndTz ? `${startTz} → ${endTz}` : startTz}
          </span>
        </div>

        <TimeZonePickerModal
          open={tzModalOpen}
          title="Event time zone"
          startLabel="Event start time zone"
          endLabel="Event end time zone"
          startTimeZone={startTz}
          endTimeZone={useSeparateEndTz ? endTz : startTz}
          onClose={() => setTzModalOpen(false)}
          onApply={({ startTimeZone, endTimeZone, useSeparateEndTimeZone }) => {
            setUseSeparateEndTz(useSeparateEndTimeZone);
            setStartTz(startTimeZone);
            setEndTz(endTimeZone);
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus:ring-offset-gray-800"
          >
            {isPending ? "Creating…" : "Create event"}
          </button>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
