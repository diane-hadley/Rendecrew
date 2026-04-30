"use client";

import { updateEvent } from "@/app/actions/events";
import { DateTimeFields } from "@/components/common/DateTimeFields";
import { TimeZonePickerModal } from "@/components/common/TimeZonePickerModal";
import {
  APP_DEFAULT_TIME_ZONE,
  normalizeTimeZone,
  rezoneWallDatetimeLocal,
  utcToWallDatetimeLocal,
} from "@/lib/event-datetime";
import {
  normalizeStartEndPair,
  shouldSyncEndToStart,
} from "@/lib/datetime-local";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

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

  const initialPair = useMemo(() => {
    const startTz = initial.startAtTimeZone;
    const endTz = initial.endAtTimeZone;
    const start = utcToWallDatetimeLocal(
      initial.startAt != null ? String(initial.startAt) : null,
      startTz,
    );
    const end = utcToWallDatetimeLocal(
      initial.endAt != null ? String(initial.endAt) : null,
      endTz,
    );
    return normalizeStartEndPair(start, end);
  }, [
    initial.startAt,
    initial.endAt,
    initial.startAtTimeZone,
    initial.endAtTimeZone,
  ]);

  const [startAt, setStartAt] = useState(initialPair.start);
  const [endAt, setEndAt] = useState(initialPair.end);
  const [startTz, setStartTz] = useState(() =>
    normalizeTimeZone(initial.startAtTimeZone, APP_DEFAULT_TIME_ZONE),
  );
  const [endTz, setEndTz] = useState(() =>
    normalizeTimeZone(initial.endAtTimeZone, startTz),
  );
  const [useSeparateEndTz, setUseSeparateEndTz] = useState(
    initial.startAtTimeZone !== initial.endAtTimeZone,
  );
  const [tzModalOpen, setTzModalOpen] = useState(false);

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
              startAt,
              endAt,
              startAtTimeZone: startTz,
              endAtTimeZone: useSeparateEndTz ? endTz : startTz,
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

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          <DateTimeFields
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
          <DateTimeFields
            id="edit-event-end"
            label="End"
            value={endAt}
            onChange={setEndAt}
          />
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
            setStartAt((s) =>
              rezoneWallDatetimeLocal(s, startTz, startTimeZone),
            );
            setEndAt((e) =>
              rezoneWallDatetimeLocal(
                e,
                useSeparateEndTz ? endTz : startTz,
                useSeparateEndTimeZone ? endTimeZone : startTimeZone,
              ),
            );
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
