"use client";

import { DateTimeFields } from "@/components/common/DateTimeFields";
import { TimeZonePickerModal } from "@/components/common/TimeZonePickerModal";
import type { useEventWallDatetimeFields } from "@/hooks/use-event-wall-datetime-fields";
import { APP_DEFAULT_TIME_ZONE, normalizeTimeZone } from "@/lib/event-datetime";

type EventWallDatetimeFieldsProps = {
  startId: string;
  endId: string;
  disabled?: boolean;
  fields: ReturnType<typeof useEventWallDatetimeFields>;
};

export function EventWallDatetimeFields({
  startId,
  endId,
  disabled = false,
  fields,
}: EventWallDatetimeFieldsProps) {
  const {
    startAt,
    endAt,
    startTz,
    endTz,
    useSeparateEndTz,
    tzModalOpen,
    setTzModalOpen,
    onStartChange,
    setEndAt,
    onTimezoneApply,
  } = fields;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          disabled={disabled}
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
          id={startId}
          label="Start"
          value={startAt}
          onChange={onStartChange}
        />
        <DateTimeFields
          id={endId}
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
        startTimeZone={normalizeTimeZone(startTz, APP_DEFAULT_TIME_ZONE)}
        endTimeZone={normalizeTimeZone(
          useSeparateEndTz ? endTz : startTz,
          startTz,
        )}
        onClose={() => setTzModalOpen(false)}
        onApply={onTimezoneApply}
      />
    </>
  );
}
